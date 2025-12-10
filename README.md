# Branch Terminal Auto Restart

Automatically restart the integrated terminal when the Git branch changes.

## Features

This extension monitors your Git branch status and automatically restarts the integrated terminal whenever you switch branches. This is useful for keeping your terminal context fresh and avoiding confusion when working with multiple branches.

*   **Auto-Restart**: Automatically kills existing terminals and starts a new one with the current branch name when the branch changes.
*   **Git Integration**: Uses VS Code's built-in Git extension for reliable branch detection.
*   **Fallback Mechanism**: Falls back to watching `.git/HEAD` if the Git extension is not available.
*   **Customizable**: Configure terminal name prefix, initial commands, and more.

## Extension Settings

This extension contributes the following settings:

*   `branchTerminal.enable`: Enable/disable this extension. (Default: `true`)
*   `branchTerminal.fallbackToFileWatcher`: Fallback to file watcher if Git extension is not available. (Default: `true`)
*   `branchTerminal.debounceMs`: Debounce time in milliseconds before restarting the terminal. (Default: `350`)
*   `branchTerminal.terminalNamePrefix`: Prefix for the terminal name. (Default: `git:`)
*   `branchTerminal.focusOnCreate`: Focus the terminal when it is created. (Default: `true`)
*   `branchTerminal.initCommand`: Command to run when the terminal is initialized. (Default: empty)

## Requirements

*   VS Code 1.50.0 or higher.
*   A workspace with a Git repository.

## Known Issues

*   None at the moment.

## Release Notes

### 0.1.0

Initial release of Branch Terminal Auto Restart.
