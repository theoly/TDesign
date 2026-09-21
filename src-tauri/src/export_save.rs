//! 导出文件的「另存为」通道 (doc/feature/export-save-dialog/spec.md)
//!
//! 此前导出走浏览器 `<a download>`，文件直落默认下载目录，用户既不能选位置、
//! 也拿不到落盘路径做反馈。这里把**系统保存对话框与写盘都放在 Rust 侧**：
//! 前端只递交内容与建议文件名，路径完全由用户在原生对话框中选定，
//! 前端无从指定任意写入位置——比暴露一个「往任意路径写文件」的命令安全。

use std::fs;

use base64::Engine as _;
use tauri_plugin_dialog::DialogExt;

/// 保存结果。取消时 `path` 为 None，前端据此区分「用户取消」与「保存成功」。
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileResult {
    pub canceled: bool,
    pub path: Option<String>,
}

/// 弹出系统保存对话框并写入内容。
///
/// * `default_name` —— 对话框中的预填文件名
/// * `contents_base64` —— 文件字节的 base64（文本与二进制统一走这条，避免编码分叉）
/// * `filter_name` / `extensions` —— 文件类型过滤器
#[tauri::command]
pub async fn export_save_file(
    app: tauri::AppHandle,
    default_name: String,
    contents_base64: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<SaveFileResult, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|e| format!("导出内容解码失败: {e}"))?;

    let mut builder = app.dialog().file().set_file_name(&default_name);
    if !extensions.is_empty() {
        let exts: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
        builder = builder.add_filter(&filter_name, &exts);
    }

    // blocking_save_file 会阻塞当前线程等待主线程弹窗，异步命令线程上调用是官方推荐用法
    let picked = builder.blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(SaveFileResult {
            canceled: true,
            path: None,
        });
    };

    let path = file_path
        .into_path()
        .map_err(|e| format!("保存路径解析失败: {e}"))?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    fs::write(&path, &bytes).map_err(|e| format!("写入文件失败: {e}"))?;

    Ok(SaveFileResult {
        canceled: false,
        path: Some(path.to_string_lossy().to_string()),
    })
}
