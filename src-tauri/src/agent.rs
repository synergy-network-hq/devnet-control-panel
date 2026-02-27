use crate::node_manager::commands::{setup_node, NodeSetupOptions, SetupProgress};
use crate::node_manager::multi_node::MultiNodeManager;
use crate::node_manager::multi_node_process::ProcessManager;
use crate::recipe::load_and_validate;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

/// Tauri command implementing deterministic, recipe-driven node setup.
/// Parses and validates the provided YAML recipe and delegates to the
/// existing node setup logic while emitting real progress events.
#[tauri::command]
pub async fn agent_setup_node(
    recipe_path: String,
    display_name: Option<String>,
    setup_options: Option<NodeSetupOptions>,
    manager: State<'_, Arc<Mutex<MultiNodeManager>>>,
    process_manager: State<'_, Arc<Mutex<ProcessManager>>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let (recipe, node_type) = load_and_validate(&recipe_path, &app_handle)?;

    // Emit a real progress event acknowledging recipe validation
    let _ = app_handle.emit(
        "setup-progress",
        SetupProgress {
            step: "recipe".to_string(),
            message: format!(
                "Validated {} recipe for {} role",
                node_type.display_name(),
                recipe.role.trim()
            ),
            progress: 0,
        },
    );

    let node_type_arg = node_type.as_str().to_string();
    let display_name = display_name.or_else(|| Some(recipe.role.trim().to_string()));

    setup_node(
        node_type_arg,
        display_name,
        setup_options,
        manager,
        process_manager,
        app_handle,
    )
    .await
}
