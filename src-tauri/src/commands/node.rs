use tauri::State as TauriState;
use crate::node_manager;


#[tauri::command]
pub fn start_node(state: TauriState<node_manager::State>) -> Result<String, String> {
node_manager::process::start_node(&state)
}


#[tauri::command]
pub fn stop_node() -> Result<String, String> {
node_manager::process::stop_node()
}


#[tauri::command]
pub fn restart_node(state: TauriState<node_manager::State>) -> Result<String, String> {
node_manager::process::stop_node()?;
node_manager::process::start_node(&state)
}