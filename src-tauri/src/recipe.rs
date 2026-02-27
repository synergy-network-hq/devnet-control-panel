use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

use crate::node_manager::types::NodeType;

#[derive(Debug, Deserialize, Clone)]
pub struct RecipeStep {
    pub name: String,
    pub description: String,
    pub progress: u8,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SetupRecipe {
    pub node_type: String,
    pub role: String,
    pub steps: Vec<RecipeStep>,
}

pub fn resolve_recipe_path(recipe_path: &str, app_handle: &AppHandle) -> Result<PathBuf, String> {
    let provided = PathBuf::from(recipe_path);
    if provided.is_absolute() && provided.exists() {
        return Ok(provided);
    }

    let mut candidates = Vec::new();

    if provided.is_relative() {
        if provided.exists() {
            candidates.push(provided.clone());
        }

        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join(&provided));
        }

        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            candidates.push(resource_dir.join(&provided));
            candidates.push(resource_dir.join("_up_").join(&provided));
        }
    }

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!("Recipe file not found: {}", recipe_path))
}

pub fn load_recipe_from_path(path: &Path) -> Result<SetupRecipe, String> {
    let contents = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read recipe at {}: {}", path.display(), e))?;
    serde_yaml::from_str::<SetupRecipe>(&contents)
        .map_err(|e| format!("Failed to parse recipe {}: {}", path.display(), e))
}

pub fn validate_recipe(recipe: &SetupRecipe) -> Result<NodeType, String> {
    let node_type_str = recipe.node_type.trim();
    if node_type_str.is_empty() {
        return Err("Recipe is missing required field: node_type".to_string());
    }

    let role = recipe.role.trim();
    if role.is_empty() {
        return Err("Recipe is missing required field: role".to_string());
    }

    let node_type = NodeType::from_str(node_type_str)
        .ok_or_else(|| format!("Unsupported node type in recipe: {}", node_type_str))?;

    if recipe.steps.is_empty() {
        return Err("Recipe must include at least one step".to_string());
    }

    let mut previous_progress = 0u8;
    for step in &recipe.steps {
        if step.name.trim().is_empty() {
            return Err("Recipe step is missing a name".to_string());
        }
        if step.description.trim().is_empty() {
            return Err(format!(
                "Recipe step {} is missing a description",
                step.name
            ));
        }
        if step.progress > 100 {
            return Err(format!(
                "Recipe step {} has invalid progress {}",
                step.name, step.progress
            ));
        }
        if step.progress < previous_progress {
            return Err(format!(
                "Recipe progress must be non-decreasing ({} -> {})",
                previous_progress, step.progress
            ));
        }
        previous_progress = step.progress;
    }

    if previous_progress != 100 {
        return Err("Final recipe step must report 100% progress".to_string());
    }

    Ok(node_type)
}

pub fn load_and_validate(
    recipe_path: &str,
    app_handle: &AppHandle,
) -> Result<(SetupRecipe, NodeType), String> {
    let resolved_path = resolve_recipe_path(recipe_path, app_handle)?;
    let recipe = load_recipe_from_path(&resolved_path)?;
    let node_type = validate_recipe(&recipe)?;
    Ok((recipe, node_type))
}
