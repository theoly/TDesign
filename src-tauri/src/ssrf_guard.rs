use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// 最大允许重定向跳数 (REQ-OD-07 / BR-07.1)
pub const MAX_REDIRECT_HOPS: u8 = 5;

#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct SSRFGuardOptions {
    pub allow_private_network: bool,
    /// 精确 host 匹配的内网豁免清单（对齐 OD OD_ALLOWED_INTERNAL_HOSTS）
    #[serde(default)]
    pub allowed_internal_hosts: Vec<String>,
}

/// 阻断原因携带 rule_id，作为单测断言锚点：A~F 见 BR-04，G~K 见 BR-07.6
#[derive(Debug, PartialEq, Eq, Clone)]
pub enum SSRFCheckResult {
    Allowed,
    Blocked { rule_id: char, reason: String },
}

impl SSRFCheckResult {
    #[allow(dead_code)]
    pub fn is_allowed(&self) -> bool {
        matches!(self, SSRFCheckResult::Allowed)
    }

    pub fn to_error_string(&self) -> Option<String> {
        match self {
            SSRFCheckResult::Allowed => None,
            SSRFCheckResult::Blocked { rule_id, reason } => {
                Some(format!("[SSRF_BLOCKED] {}: {}", rule_id, reason))
            }
        }
    }
}

fn is_link_local_v4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 169 && octets[1] == 254
}

fn is_private_v4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    // 10.0.0.0/8
    if octets[0] == 10 {
        return true;
    }
    // 172.16.0.0/12
    if octets[0] == 172 && (16..=31).contains(&octets[1]) {
        return true;
    }
    // 192.168.0.0/16
    if octets[0] == 192 && octets[1] == 168 {
        return true;
    }
    false
}

fn is_cgnat_v4(ip: Ipv4Addr) -> bool {
    // 100.64.0.0/10: 100.64.0.0 - 100.127.255.255
    let octets = ip.octets();
    octets[0] == 100 && (octets[1] & 0xc0) == 64
}

fn is_unspecified_v4(ip: Ipv4Addr) -> bool {
    // 0.0.0.0/8
    ip.octets()[0] == 0
}

fn is_multicast_or_broadcast_v4(ip: Ipv4Addr) -> bool {
    ip.is_multicast() || ip.is_broadcast()
}

fn is_cloud_metadata_v6(ip: Ipv6Addr) -> bool {
    // AWS IPv6 metadata: fd00:ec2::254
    let segments = ip.segments();
    segments[0] == 0xfd00
        && segments[1] == 0x0ec2
        && segments[2] == 0
        && segments[3] == 0
        && segments[4] == 0
        && segments[5] == 0
        && segments[6] == 0
        && segments[7] == 0x0254
}

fn is_private_v6(ip: Ipv6Addr) -> bool {
    // Unique local address fc00::/7 (fc00::/8 and fd00::/8)
    let first = ip.segments()[0];
    (first & 0xfe00) == 0xfc00
}

fn is_link_local_v6(ip: Ipv6Addr) -> bool {
    // fe80::/10
    let first = ip.segments()[0];
    (first & 0xffc0) == 0xfe80
}

fn is_nat64_v6(ip: Ipv6Addr) -> bool {
    // 64:ff9b::/96
    let s = ip.segments();
    s[0] == 0x0064 && s[1] == 0xff9b && s[2] == 0 && s[3] == 0 && s[4] == 0 && s[5] == 0
}

/// 检查单个 IP 地址是否符合安全约束
/// 返回 None 表示通过，Some(SSRFCheckResult) 表示阻断
fn check_single_ip(
    raw_ip: IpAddr,
    _host_str: &str,
    opts: &SSRFGuardOptions,
    is_internal_exempt: bool,
) -> Option<SSRFCheckResult> {
    // BR-07.3: IPv4-mapped IPv6 (::ffff:0:0/96) 必须先还原为 IPv4 再行判定
    let ip = match raw_ip {
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                IpAddr::V4(v4)
            } else {
                IpAddr::V6(v6)
            }
        }
        v4 => v4,
    };

    match ip {
        IpAddr::V4(v4) => {
            // 0.0.0.0/8 (未指定/本网络) - 不可豁免
            if is_unspecified_v4(v4) {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'K',
                    reason: "禁止访问未指定或本网络地址 (0.0.0.0/8)".to_string(),
                });
            }
            // 云元数据 169.254.169.254 - 不可豁免
            if v4 == Ipv4Addr::new(169, 254, 169, 254) {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'B',
                    reason: "禁止访问云元数据服务端点 (169.254.169.254)".to_string(),
                });
            }
            // 链路本地 (169.254.0.0/16) - 不可豁免
            if is_link_local_v4(v4) {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'C',
                    reason: "禁止访问链路本地地址 (169.254.0.0/16)".to_string(),
                });
            }
            // 100.64.0.0/10 (CGNAT 共享网段)
            if is_cgnat_v4(v4) {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'K',
                    reason: "禁止访问 CGNAT 共享地址段 (100.64.0.0/10)".to_string(),
                });
            }
            // 多播或广播 - 不可豁免
            if is_multicast_or_broadcast_v4(v4) {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'C',
                    reason: "禁止访问多播或广播地址".to_string(),
                });
            }
            // 回环地址 (127.0.0.0/8)
            if v4.is_loopback() {
                return None;
            }
            // 私有网段 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
            if is_private_v4(v4) {
                if opts.allow_private_network || is_internal_exempt {
                    return None;
                } else {
                    return Some(SSRFCheckResult::Blocked {
                        rule_id: 'F',
                        reason: format!(
                            "私有局域网网段默认阻断 ({})。如需连接内网模型，请开启 allow_private_network 或配置 allowed_internal_hosts",
                            v4
                        ),
                    });
                }
            }
        }
        IpAddr::V6(v6) => {
            // ::/128 (未指定地址) - 不可豁免
            if v6.is_unspecified() {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'K',
                    reason: "禁止访问未指定 IPv6 地址 (::/128)".to_string(),
                });
            }
            // 64:ff9b::/96 (NAT64 前缀)
            if is_nat64_v6(v6) {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'K',
                    reason: "禁止访问 NAT64 前缀地址 (64:ff9b::/96)".to_string(),
                });
            }
            // 云元数据 fd00:ec2::254 - 不可豁免
            if is_cloud_metadata_v6(v6) {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'B',
                    reason: "禁止访问云元数据 IPv6 端点 (fd00:ec2::254)".to_string(),
                });
            }
            // 链路本地 fe80::/10 - 不可豁免
            if is_link_local_v6(v6) {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'C',
                    reason: "禁止访问 IPv6 链路本地地址 (fe80::/10)".to_string(),
                });
            }
            // 多播 ff00::/8 - 不可豁免
            if v6.is_multicast() {
                return Some(SSRFCheckResult::Blocked {
                    rule_id: 'C',
                    reason: "禁止访问 IPv6 多播地址 (ff00::/8)".to_string(),
                });
            }
            // 回环 ::1
            if v6.is_loopback() {
                return None;
            }
            // 唯一本地地址 fc00::/7 (ULA)
            if is_private_v6(v6) {
                if opts.allow_private_network || is_internal_exempt {
                    return None;
                } else {
                    return Some(SSRFCheckResult::Blocked {
                        rule_id: 'F',
                        reason: "IPv6 唯一本地地址 (fc00::/7) 默认阻断".to_string(),
                    });
                }
            }
        }
    }

    None
}

/// 默认系统 DNS 解析
pub fn default_dns_resolve(host: &str) -> Result<Vec<IpAddr>, String> {
    use std::net::ToSocketAddrs;
    let addrs = (host, 443).to_socket_addrs().map_err(|e| e.to_string())?;
    Ok(addrs.map(|s| s.ip()).collect())
}

/// 校验目标 URL，支持传入自定义 DNS 解析器（方便单测注入）
pub fn validate_target_url_with_dns<F>(
    url_str: &str,
    opts: &SSRFGuardOptions,
    dns_resolver: Option<F>,
) -> SSRFCheckResult
where
    F: Fn(&str) -> Result<Vec<IpAddr>, String>,
{
    // 针对 IPv6 未带方括号的 URL 进行前置检测 (Rule J)
    // 例如 http://::1/ 或 http://fe80::1/
    if let Some(after_scheme) = url_str.split("://").nth(1) {
        let host_part = after_scheme.split('/').next().unwrap_or("").split(':').collect::<Vec<_>>();
        // 如果有超过1个冒号且不包含方括号，通常是未带方括号的 IPv6 字面量
        if after_scheme.starts_with("::")
            || (host_part.len() > 2 && !after_scheme.contains('['))
        {
            return SSRFCheckResult::Blocked {
                rule_id: 'J',
                reason: "IPv6 字面量在 URL 中必须使用方括号包裹 (如 [::1])".to_string(),
            };
        }
    }

    let parsed = match reqwest::Url::parse(url_str) {
        Ok(u) => u,
        Err(e) => {
            return SSRFCheckResult::Blocked {
                rule_id: 'J',
                reason: format!("非法 URL 格式: {}", e),
            }
        }
    };

    let scheme = parsed.scheme().to_lowercase();
    let host_str = match parsed.host_str() {
        Some(h) => h.to_lowercase(),
        None => {
            return SSRFCheckResult::Blocked {
                rule_id: 'J',
                reason: "缺失目标 Host".to_string(),
            }
        }
    };

    // 精确 host 匹配的内网豁免检查 (BR-07.4: 禁止子串/子域通配)
    let is_internal_exempt = opts
        .allowed_internal_hosts
        .iter()
        .any(|allowed| allowed.to_lowercase() == host_str);

    // 1. 规则 B: 拦截已知云元数据主机名 (不可豁免)
    if host_str == "169.254.169.254"
        || host_str == "instance-data"
        || host_str == "metadata.google.internal"
        || host_str.ends_with(".metadata.google.internal")
    {
        return SSRFCheckResult::Blocked {
            rule_id: 'B',
            reason: "禁止访问云元数据服务端点".to_string(),
        };
    }

    // 2. 判断是否为本地回环 (localhost / 127.0.0.1 / ::1)
    let is_loopback = host_str == "localhost"
        || host_str == "127.0.0.1"
        || host_str == "::1"
        || host_str == "[::1]";

    // 回环地址放行 (Rule D)
    if is_loopback {
        return SSRFCheckResult::Allowed;
    }

    // 检查直接 IP 访问 (优先于协议检查，确保私网与黑名单 IP 准确命中对应 rule_id)
    let clean_host = host_str.trim_start_matches('[').trim_end_matches(']');
    let parsed_ip = clean_host.parse::<IpAddr>().ok();
    if let Some(ip) = parsed_ip {
        if let Some(blocked) = check_single_ip(ip, &host_str, opts, is_internal_exempt) {
            return blocked;
        }
    }

    let is_private_ip = if let Some(ip) = parsed_ip {
        match ip {
            IpAddr::V4(v4) => is_private_v4(v4),
            IpAddr::V6(v6) => is_private_v6(v6),
        }
    } else {
        false
    };

    let allow_http = (is_private_ip || is_internal_exempt) && (opts.allow_private_network || is_internal_exempt);

    // 规则 A: 协议检查。仅回环或经许可的内网允许 http://，其余必须使用 https://
    if scheme == "http" && !allow_http {
        return SSRFCheckResult::Blocked {
            rule_id: 'A',
            reason: "除本地回环与受许可内网外，禁止使用非加密 HTTP 协议".to_string(),
        };
    } else if scheme != "http" && scheme != "https" {
        return SSRFCheckResult::Blocked {
            rule_id: 'A',
            reason: format!("不支持的网络协议: {}", scheme),
        };
    }

    if parsed_ip.is_some() {
        return SSRFCheckResult::Allowed;
    }

    // 4. 对域名执行 DNS 解析后检查 (Rule I / BR-07.2)
    if let Some(resolver) = dns_resolver {
        if let Ok(resolved_ips) = resolver(&host_str) {
            for rip in resolved_ips {
                if let Some(blocked) = check_single_ip(rip, &host_str, opts, is_internal_exempt) {
                    let rule_id = match blocked {
                        SSRFCheckResult::Blocked { rule_id, .. } => rule_id,
                        _ => 'I',
                    };
                    return SSRFCheckResult::Blocked {
                        rule_id: 'I',
                        reason: format!(
                            "DNS 解析记录 ({}) 命中受保护网段 (规则 {} 阻断)",
                            rip, rule_id
                        ),
                    };
                }
            }
        }
    }

    // 5. 标准公网 HTTPS 域名放行 (Rule E)
    SSRFCheckResult::Allowed
}

/// 生产默认校验函数
pub fn validate_target_url(url_str: &str, opts: &SSRFGuardOptions) -> SSRFCheckResult {
    validate_target_url_with_dns(url_str, opts, Some(default_dns_resolve))
}

/// 校验重定向跃点数与目标安全性 (REQ-OD-07 / BR-07.1 / Rule G, H)
pub fn validate_redirect_hop(
    hop_count: u8,
    next_url: &str,
    opts: &SSRFGuardOptions,
) -> Result<(), SSRFCheckResult> {
    if hop_count > MAX_REDIRECT_HOPS {
        return Err(SSRFCheckResult::Blocked {
            rule_id: 'G',
            reason: format!("重定向跳数超限 (超过 {} 跳)", MAX_REDIRECT_HOPS),
        });
    }

    match validate_target_url(next_url, opts) {
        SSRFCheckResult::Allowed => Ok(()),
        SSRFCheckResult::Blocked { rule_id, reason } => Err(SSRFCheckResult::Blocked {
            rule_id: 'H',
            reason: format!("重定向目标违规 (rule {}): {}", rule_id, reason),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rule_g_and_h_redirect_validation() {
        let opts = SSRFGuardOptions::default();

        // 超过 5 跳应以规则 G 阻断
        let res = validate_redirect_hop(6, "https://api.openai.com/v1", &opts);
        assert_eq!(
            res,
            Err(SSRFCheckResult::Blocked {
                rule_id: 'G',
                reason: "重定向跳数超限 (超过 5 跳)".to_string(),
            })
        );

        // 合法公网 HTTPS 重定向通过
        let res = validate_redirect_hop(1, "https://api.openai.com/v1", &opts);
        assert_eq!(res, Ok(()));

        // CHK-OD-13 ①: 公网 HTTPS 域 302 跳转至 169.254.169.254，以规则 H 阻断
        let res = validate_redirect_hop(1, "http://169.254.169.254/latest/meta-data", &opts);
        assert!(matches!(res, Err(SSRFCheckResult::Blocked { rule_id: 'H', .. })));
    }

    #[test]
    fn test_rule_a_blocks_insecure_http_and_unsupported_schemes() {
        let opts = SSRFGuardOptions::default();
        // 公网 HTTP 协议必须阻断
        let res = validate_target_url("http://api.openai.com/v1/chat", &opts);
        assert_eq!(
            res,
            SSRFCheckResult::Blocked {
                rule_id: 'A',
                reason: "除本地回环与受许可内网外，禁止使用非加密 HTTP 协议".to_string()
            }
        );

        // 不支持的协议
        let res = validate_target_url("ftp://api.openai.com/v1", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'A', .. }));
    }

    #[test]
    fn test_rule_b_blocks_cloud_metadata_hard() {
        // 即便开启了 allow_private_network，云元数据也必须硬阻断（不可豁免项）
        let opts = SSRFGuardOptions {
            allow_private_network: true,
            allowed_internal_hosts: vec!["169.254.169.254".to_string()],
        };
        assert!(matches!(
            validate_target_url("http://169.254.169.254/latest/meta-data/", &opts),
            SSRFCheckResult::Blocked { rule_id: 'B', .. }
        ));
        assert!(matches!(
            validate_target_url("https://169.254.169.254/meta", &opts),
            SSRFCheckResult::Blocked { rule_id: 'B', .. }
        ));
        assert!(matches!(
            validate_target_url("https://[fd00:ec2::254]/meta", &opts),
            SSRFCheckResult::Blocked { rule_id: 'B', .. }
        ));
        assert!(matches!(
            validate_target_url("http://metadata.google.internal/computeMetadata/v1", &opts),
            SSRFCheckResult::Blocked { rule_id: 'B', .. }
        ));
    }

    #[test]
    fn test_rule_c_blocks_link_local_and_multicast() {
        let opts = SSRFGuardOptions {
            allow_private_network: true,
            allowed_internal_hosts: vec![],
        };
        // 链路本地 169.254.0.1
        let res = validate_target_url("https://169.254.1.1/api", &opts);
        assert_eq!(
            res,
            SSRFCheckResult::Blocked {
                rule_id: 'C',
                reason: "禁止访问链路本地地址 (169.254.0.0/16)".to_string()
            }
        );

        // IPv6 链路本地 fe80::1
        let res = validate_target_url("https://[fe80::1]/api", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'C', .. }));

        // 多播 224.0.0.1
        let res = validate_target_url("https://224.0.0.1/api", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'C', .. }));
    }

    #[test]
    fn test_rule_d_allows_loopback_over_http_and_https() {
        let opts = SSRFGuardOptions::default();
        assert_eq!(
            validate_target_url("http://localhost:11434/v1/models", &opts),
            SSRFCheckResult::Allowed
        );
        assert_eq!(
            validate_target_url("http://127.0.0.1:11434/v1/chat", &opts),
            SSRFCheckResult::Allowed
        );
        assert_eq!(
            validate_target_url("http://[::1]:11434/v1", &opts),
            SSRFCheckResult::Allowed
        );
        assert_eq!(
            validate_target_url("https://localhost:8443/v1", &opts),
            SSRFCheckResult::Allowed
        );
    }

    #[test]
    fn test_rule_e_allows_public_https_domains() {
        let opts = SSRFGuardOptions::default();
        assert_eq!(
            validate_target_url("https://api.openai.com/v1/chat/completions", &opts),
            SSRFCheckResult::Allowed
        );
        assert_eq!(
            validate_target_url("https://dashscope.aliyuncs.com/compatible-mode/v1", &opts),
            SSRFCheckResult::Allowed
        );
    }

    #[test]
    fn test_rule_f_and_chk_od_19_private_network_controlled_by_option() {
        let mut opts = SSRFGuardOptions {
            allow_private_network: false,
            allowed_internal_hosts: vec![],
        };

        // 未开启时阻断 192.168.1.10
        let res = validate_target_url("http://192.168.1.10:11434", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'F', .. }));

        let res = validate_target_url("https://10.0.0.1:8080", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'F', .. }));

        // 开启后放行
        opts.allow_private_network = true;
        assert_eq!(
            validate_target_url("http://192.168.1.10:11434", &opts),
            SSRFCheckResult::Allowed
        );
        assert_eq!(
            validate_target_url("https://10.0.0.1:8080", &opts),
            SSRFCheckResult::Allowed
        );

        // 使用 allowed_internal_hosts 单独豁免
        let exempt_opts = SSRFGuardOptions {
            allow_private_network: false,
            allowed_internal_hosts: vec!["192.168.1.10".to_string()],
        };
        assert_eq!(
            validate_target_url("http://192.168.1.10:11434", &exempt_opts),
            SSRFCheckResult::Allowed
        );
        // 其他私网地址依旧阻断
        assert!(matches!(
            validate_target_url("http://192.168.1.11:11434", &exempt_opts),
            SSRFCheckResult::Blocked { rule_id: 'F', .. }
        ));
    }

    #[test]
    fn test_rule_j_blocks_invalid_host_and_unbracketed_ipv6() {
        let opts = SSRFGuardOptions::default();
        // IPv6 未带方括号
        let res = validate_target_url("http://::1/v1", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'J', .. }));

        let res = validate_target_url("https://fe80::1/v1", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'J', .. }));
    }

    #[test]
    fn test_rule_k_blocks_supplemental_subnets() {
        let opts = SSRFGuardOptions {
            allow_private_network: true, // 不受 allow_private_network 豁免
            allowed_internal_hosts: vec![],
        };

        // 0.0.0.0/8
        let res = validate_target_url("https://0.0.0.1/api", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'K', .. }));

        // 100.64.0.1 (CGNAT)
        let res = validate_target_url("https://100.64.0.1/api", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'K', .. }));

        // ::ffff:169.254.169.254 (IPv4-mapped 还原为云元数据)
        let res = validate_target_url("https://[::ffff:169.254.169.254]/api", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'B', .. }));

        // ::/128 未指定
        let res = validate_target_url("https://[::]/api", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'K', .. }));

        // 64:ff9b::1 NAT64
        let res = validate_target_url("https://[64:ff9b::1]/api", &opts);
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'K', .. }));
    }

    #[test]
    fn test_rule_i_dns_rebind_resolution_blocks_poisoned_ip() {
        let opts = SSRFGuardOptions {
            allow_private_network: false,
            allowed_internal_hosts: vec![],
        };

        // 模拟 DNS 解析返回包含私网 IP
        let mock_dns = |_host: &str| -> Result<Vec<IpAddr>, String> {
            Ok(vec![
                IpAddr::V4(Ipv4Addr::new(93, 184, 216, 34)),
                IpAddr::V4(Ipv4Addr::new(192, 168, 1, 50)),
            ])
        };

        let res = validate_target_url_with_dns(
            "https://attacker-domain.com/v1",
            &opts,
            Some(mock_dns),
        );
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'I', .. }));
    }

    #[test]
    fn test_exact_host_match_does_not_pass_attacker_subdomain() {
        // CHK-OD-13 ④: https://api.openai.com.attacker.net (精确 host 匹配，不得因子串放行)
        let opts = SSRFGuardOptions {
            allow_private_network: false,
            allowed_internal_hosts: vec!["api.openai.com".to_string()],
        };

        let mock_dns = |_host: &str| -> Result<Vec<IpAddr>, String> {
            Ok(vec![IpAddr::V4(Ipv4Addr::new(10, 0, 0, 99))])
        };

        // 因为 attacker.net 不是 exact match "api.openai.com"，且解析到 10.0.0.99，所以被拦截
        let res = validate_target_url_with_dns(
            "https://api.openai.com.attacker.net/v1",
            &opts,
            Some(mock_dns),
        );
        assert!(matches!(res, SSRFCheckResult::Blocked { rule_id: 'I', .. }));
    }
}
