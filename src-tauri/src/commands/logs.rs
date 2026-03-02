use tauri::State as TauriState;
use crate::node_manager;


#[tauri::command]
pub fn read_log_file(state: TauriState<node_manager::State>) -> Result<String, String> {
node_manager::logs::read_log_file(&state)
}