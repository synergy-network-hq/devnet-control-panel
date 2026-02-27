use tauri::State as TauriState;
use crate::node_manager;


#[tauri::command]
pub fn init_node_environment(state: TauriState<node_manager::State>) -> Result<String, String> {
node_manager::init::init_node_environment(&state)
}


#[tauri::command]
pub async fn install_node_binaries(state: TauriState<'_, node_manager::State>) -> Result<String, String> {
node_manager::installer::install_node_binaries(&state).await
}