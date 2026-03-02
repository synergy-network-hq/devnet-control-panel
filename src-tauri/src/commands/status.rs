use tauri::State as TauriState;
use crate::node_manager;


#[tauri::command]
pub fn get_node_status(state: TauriState<node_manager::State>) -> Result<String, String> {
node_manager::status::get_node_status(&state)
}