use super::NodeManager;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

#[tauri::command]
pub async fn read_log_file(
    state: State<'_, Arc<Mutex<NodeManager>>>,
    lines: Option<usize>,
) -> Result<Vec<String>, String> {
    let manager = state.lock().await;
    let log_path = manager.node_info.logs_path.clone();
    drop(manager);

    let file = File::open(&log_path)
        .await
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let reader = BufReader::new(file);
    let mut log_lines = Vec::new();
    let mut lines_reader = reader.lines();

    while let Some(line) = lines_reader
        .next_line()
        .await
        .map_err(|e| format!("Failed to read line: {}", e))?
    {
        log_lines.push(line);
    }

    // Return last N lines if specified
    if let Some(n) = lines {
        let start = log_lines.len().saturating_sub(n);
        Ok(log_lines[start..].to_vec())
    } else {
        Ok(log_lines)
    }
}

#[tauri::command]
pub async fn stream_logs(
    app: AppHandle,
    state: State<'_, Arc<Mutex<NodeManager>>>,
) -> Result<(), String> {
    let manager = state.lock().await;
    let log_path = manager.node_info.logs_path.clone();
    drop(manager);

    tokio::spawn(async move {
        if let Ok(file) = File::open(&log_path).await {
            let reader = BufReader::new(file);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("log-line", line);
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        }
    });

    Ok(())
}
