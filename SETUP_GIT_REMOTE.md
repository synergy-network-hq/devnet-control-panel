# Setting Up Git Remote and Pulling Changes

## Current Status
- Git repository initialized
- Remote `origin` set to: `https://github.com/synergy-network-hq/devnet-control-panel.git`

## To Pull Changes

The repository requires authentication. Choose one of these methods:

### Option 1: Use SSH (Recommended if you have SSH keys set up)

```bash
cd /home/devpup/Desktop/devnet-control-panel
git remote set-url origin git@github.com:synergy-network-hq/devnet-control-panel.git
git fetch origin
git pull origin main  # or 'master', depending on the default branch
```

### Option 2: Use HTTPS with Personal Access Token

1. Create a Personal Access Token on GitHub:
   - Go to: https://github.com/settings/tokens
   - Generate new token (classic) with `repo` permissions
   - Copy the token

2. Pull with token:
```bash
cd /home/devpup/Desktop/devnet-control-panel
git pull https://YOUR_TOKEN@github.com/synergy-network-hq/devnet-control-panel.git main
```

Or configure credential helper:
```bash
git config credential.helper store
git pull origin main
# Enter your GitHub username and use the token as password when prompted
```

### Option 3: Check Available Branches First

```bash
cd /home/devpup/Desktop/devnet-control-panel
# Try to see what branches exist (may work if repo is public)
git ls-remote --heads origin

# Then pull the appropriate branch
git pull origin <branch-name> --allow-unrelated-histories
```

## If You Have Local Changes

Before pulling, you may want to:

1. **Commit your local changes:**
```bash
git add .
git commit -m "Local changes before pulling from remote"
```

2. **Or stash them:**
```bash
git stash
git pull origin main
git stash pop  # Reapply your changes after pulling
```

## Verify Remote

```bash
git remote -v
```

Should show:
```
origin  https://github.com/synergy-network-hq/devnet-control-panel.git (fetch)
origin  https://github.com/synergy-network-hq/devnet-control-panel.git (push)
```

