//! 工程文件夹读写 (A2 / T-AE-39, T-AE-40, T-AE-41)
//!
//! PRD D1 / §3.8.2 指定工程为一个文件夹，自动保存采用「临时文件 + 原子重命名」。
//! 此前整个文件 IO 层不存在，实际走 localStorage（ISSUE-008），带来两个后果：
//!   1. ~5–10MB 硬上限，写满抛 QuotaExceededError 且无捕获，会连带导致工程保存失败；
//!   2. 会话存档等体积敏感的功能完全无处落盘。
//!
//! 安全边界：**不引入 tauri-plugin-fs 的宽泛作用域**，而是由这里的命令强制
//! 「一切相对路径必须落在工程根目录内」。调用方无法通过 `..` 或绝对路径越界。

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Component, Path, PathBuf};

/// 校验相对路径并拼出绝对路径。拒绝绝对路径、`..` 回溯与空段。
fn resolve(root: &str, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(format!("拒绝绝对路径: {rel}"));
    }
    for comp in rel_path.components() {
        match comp {
            Component::Normal(_) => {}
            Component::CurDir => {}
            _ => return Err(format!("路径越界或非法: {rel}")),
        }
    }
    let root_path = Path::new(root);
    if !root_path.is_absolute() {
        return Err(format!("工程根目录必须是绝对路径: {root}"));
    }
    Ok(root_path.join(rel_path))
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn project_ensure_dir(root: String, rel: String) -> Result<(), String> {
    let path = resolve(&root, &rel)?;
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {e}"))
}

#[tauri::command]
pub fn project_exists(root: String, rel: String) -> Result<bool, String> {
    Ok(resolve(&root, &rel)?.exists())
}

#[tauri::command]
pub fn project_read_text(root: String, rel: String) -> Result<Option<String>, String> {
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("读取失败 {rel}: {e}"))
}

/// 原子写入：先写临时文件并 fsync，再 rename 覆盖。
/// 中途崩溃时目标文件仍保持上一个完整版本 (PRD §3.8.2)。
#[tauri::command]
pub fn project_write_text_atomic(root: String, rel: String, contents: String) -> Result<(), String> {
    let path = resolve(&root, &rel)?;
    ensure_parent(&path)?;
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("dat")
    ));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("创建临时文件失败: {e}"))?;
        f.write_all(contents.as_bytes())
            .map_err(|e| format!("写入失败: {e}"))?;
        f.sync_all().map_err(|e| format!("落盘失败: {e}"))?;
    }
    fs::rename(&tmp, &path).map_err(|e| format!("原子重命名失败: {e}"))
}

/// JSONL 追加写 (T-AE-31)。
///
/// 会话是 append-only 事件流：追加不读不改已有内容，写入放大为零；
/// 崩溃最多丢失最后一行，而单个大 JSON 一处损坏就全文件报废。
#[tauri::command]
pub fn project_append_line(root: String, rel: String, line: String) -> Result<(), String> {
    let path = resolve(&root, &rel)?;
    ensure_parent(&path)?;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("打开追加失败: {e}"))?;
    // 单行内不得含换行，否则会破坏 JSONL 的行边界
    let sanitized = line.replace('\n', "\\n").replace('\r', "");
    writeln!(f, "{sanitized}").map_err(|e| format!("追加失败: {e}"))?;
    f.sync_all().map_err(|e| format!("落盘失败: {e}"))
}

/// 读取 JSONL 的最后 N 行（打开工程时恢复最近若干轮对话）。
/// 无法解析的行由调用方跳过——这正是 JSONL 相对单 JSON 的关键优势。
#[tauri::command]
pub fn project_read_tail_lines(root: String, rel: String, limit: usize) -> Result<Vec<String>, String> {
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let f = fs::File::open(&path).map_err(|e| format!("读取失败: {e}"))?;
    let mut buf: std::collections::VecDeque<String> = std::collections::VecDeque::with_capacity(limit);
    for line in BufReader::new(f).lines() {
        let line = line.map_err(|e| format!("读行失败: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        if buf.len() == limit {
            buf.pop_front();
        }
        buf.push_back(line);
    }
    Ok(buf.into_iter().collect())
}

#[tauri::command]
pub fn project_read_all_lines(root: String, rel: String) -> Result<Vec<String>, String> {
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let f = fs::File::open(&path).map_err(|e| format!("读取失败: {e}"))?;
    BufReader::new(f)
        .lines()
        .collect::<Result<Vec<_>, _>>()
        .map(|v| v.into_iter().filter(|l| !l.trim().is_empty()).collect())
        .map_err(|e| format!("读行失败: {e}"))
}

/// 写入二进制资产（图片附件转存，T-AE-32）。入参为 base64，不含 data URI 前缀。
#[tauri::command]
pub fn project_write_binary(root: String, rel: String, base64_data: String) -> Result<(), String> {
    use base64::Engine;
    let path = resolve(&root, &rel)?;
    ensure_parent(&path)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    fs::write(&path, bytes).map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
pub fn project_list_dir(root: String, rel: String) -> Result<Vec<String>, String> {
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut names: Vec<String> = fs::read_dir(&path)
        .map_err(|e| format!("列目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn project_delete(root: String, rel: String) -> Result<(), String> {
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("删除目录失败: {e}"))
    } else {
        fs::remove_file(&path).map_err(|e| format!("删除失败: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_escaping_paths() {
        assert!(resolve("/tmp/p", "../etc/passwd").is_err());
        assert!(resolve("/tmp/p", "a/../../b").is_err());
        assert!(resolve("/tmp/p", "/etc/passwd").is_err());
        assert!(resolve("relative/root", "a.json").is_err());
    }

    #[test]
    fn accepts_in_scope_paths() {
        assert!(resolve("/tmp/p", "project.json").is_ok());
        assert!(resolve("/tmp/p", "conversations/2026-09.jsonl").is_ok());
        assert!(resolve("/tmp/p", "./assets/images/a.png").is_ok());
    }
}
