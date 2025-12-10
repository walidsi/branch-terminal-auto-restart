const vscode = require('vscode');

let disposables = [];
const repoState = new Map(); // key: repoRoot (string) -> { lastLabel, timer, pollInterval }

function activate(context) {
  const cfg = vscode.workspace.getConfiguration('branchTerminal');
  if (!cfg.get('enable', true)) {
    return;
  }

  // Try to hook the built-in Git extension
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (gitExt) {
    // ensure it is activated, then get API
    Promise.resolve(gitExt.activate && gitExt.activate())
      .catch(() => {})
      .then(() => {
        try {
          const git = gitExt.exports && gitExt.exports.getAPI && gitExt.exports.getAPI(1);
          if (git) {
            // Listen for repositories opened/closed
            if (typeof git.onDidOpenRepository === 'function') {
              disposables.push(git.onDidOpenRepository((r) => watchRepository(r)));
            }
            if (typeof git.onDidCloseRepository === 'function') {
              disposables.push(git.onDidCloseRepository((r) => unwatchRepository(r)));
            }

            // Start watching existing repos
            if (Array.isArray(git.repositories)) {
              git.repositories.forEach(r => watchRepository(r));
            }
            // Removed incorrect usage of context.subscriptions.push(...disposables)
            // Disposables are managed by the cleanup block below.
            return;
          }
        } catch (e) {
          // fall through to file watcher fallback
          console.error('branch-terminal: git API error', e);
        }

        // If we reach here, fallback to file watcher if enabled
        if (cfg.get('fallbackToFileWatcher', true)) {
          setupFileWatcher(context);
        }
      });
  } else {
    // No git extension installed; fallback if configured
    if (cfg.get('fallbackToFileWatcher', true)) {
      setupFileWatcher(context);
    }
  }

  // Clean up on deactivate
  context.subscriptions.push({
    dispose: () => {
      for (const [, s] of repoState) {
        if (s.timer) clearTimeout(s.timer);
        if (s.pollInterval) clearInterval(s.pollInterval);
      }
      repoState.clear();
      disposables.forEach(d => d && d.dispose && d.dispose());
      disposables = []; // Clear array
    }
  });
}

async function tryRestartUsingGitApiOnce() {
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (!gitExt) return false;
  try {
    if (gitExt.activate) {
      await gitExt.activate();
    }
    const git = gitExt.exports && gitExt.exports.getAPI && gitExt.exports.getAPI(1);
    if (!git) return false;
    if (!Array.isArray(git.repositories) || git.repositories.length === 0) return false;

    // pick repository that matches first workspace folder or the first available
    const ws = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    let repo = git.repositories.find(r => ws && r.rootUri && r.rootUri.fsPath === ws.uri.fsPath) || git.repositories[0];
    if (!repo) return false;

    // Attempt to read HEAD info
    const head = repo.state && repo.state.HEAD;
    const branch = head && (head.name || (head.commit ? head.commit.substr(0,7) : null));
    await restartTerminalsForBranch(branch, repo);
    return true;
  } catch (e) {
    console.error('branch-terminal: error using git API', e);
    return false;
  }
}

function watchRepository(repo) {
  if (!repo || !repo.rootUri) return;
  const root = repo.rootUri.fsPath;
  // Avoid double-watch
  if (repoState.has(root)) return;

  const cfg = vscode.workspace.getConfiguration('branchTerminal');
  const debounceMs = cfg.get('debounceMs', 350);

  // try to subscribe to repository state changes (Repository.state.onDidChange)
  if (repo.state && typeof repo.state.onDidChange === 'function') {
    const disposable = repo.state.onDidChange(() => {
      scheduleRepositoryCheck(root, repo, debounceMs);
    });
    disposables.push(disposable);
    // initial sync
    scheduleRepositoryCheck(root, repo, 0);
    repoState.set(root, { lastLabel: null, timer: null });
    return;
  }

  // If onDidChange not available, fallback to polling HEAD for this repo
  const pollIntervalMs = 1000;
  const interval = setInterval(() => {
    scheduleRepositoryCheck(root, repo, debounceMs);
  }, pollIntervalMs);
  repoState.set(root, { lastLabel: null, pollInterval: interval, timer: null });
}

function unwatchRepository(repo) {
  if (!repo || !repo.rootUri) return;
  const root = repo.rootUri.fsPath;
  const s = repoState.get(root);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  if (s.pollInterval) clearInterval(s.pollInterval);
  repoState.delete(root);
}

function scheduleRepositoryCheck(root, repo, debounceMs) {
  const s = repoState.get(root) || { lastLabel: null, timer: null };
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(async () => {
    try {
      const head = repo.state && repo.state.HEAD;
      let branch = null;
      if (head) {
        branch = head.name || (head.commit ? head.commit.substr(0,7) : null);
      }
      await restartTerminalsForBranch(branch, repo);
    } catch (e) {
      console.error('branch-terminal: error checking repo state', e);
    }
    s.timer = null;
  }, debounceMs);
  repoState.set(root, s);
}

async function restartTerminalsForBranch(branch, repo) {
  const cfg = vscode.workspace.getConfiguration('branchTerminal');
  const prefix = cfg.get('terminalNamePrefix', 'git:');
  const focus = cfg.get('focusOnCreate', true);
  const initCmd = cfg.get('initCommand', '');
  const root = repo && repo.rootUri ? repo.rootUri.fsPath : 'workspace';
  const repoName = repo && repo.rootUri ? repo.rootUri.path.split('/').pop() : null;
  const label = branch ? `${prefix}${repoName ? repoName + '/' : ''}${branch}` : `${prefix}${repoName ? repoName + '/detached' : 'detached'}`;

  const s = repoState.get(root) || { lastLabel: null };
  if (s.lastLabel === label) return;
  s.lastLabel = label;
  repoState.set(root, s);

  // Kill all integrated terminals and open a new one (Original behavior)
  try {
    await vscode.commands.executeCommand('workbench.action.terminal.killAll');
  } catch (e) {
    console.error('branch-terminal: failed to kill terminals', e);
  }

  const terminal = vscode.window.createTerminal({ name: label });
  if (focus) terminal.show(true);
  if (initCmd && initCmd.trim().length) {
    // send command and execute
    terminal.sendText(initCmd, true);
  }
}

function setupFileWatcher(context) {
  const cfg = vscode.workspace.getConfiguration('branchTerminal');
  const debounceMs = cfg.get('debounceMs', 350);
  const watcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD');
  context.subscriptions.push(watcher);
  const schedule = (uri) => {
    // determine a key for this HEAD (its parent folder)
    const key = uri ? uri.fsPath : 'default';
    const s = repoState.get(key) || { lastLabel: null, timer: null };
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      void handleHeadFile(uri);
      s.timer = null;
    }, debounceMs);
    repoState.set(key, s);
  };
  watcher.onDidCreate(schedule, null, context.subscriptions);
  watcher.onDidChange(schedule, null, context.subscriptions);
  watcher.onDidDelete(schedule, null, context.subscriptions);

  // initial sync
  vscode.workspace.findFiles('**/.git/HEAD', '**/node_modules/**', 50).then(list => {
    for (const uri of list) {
      schedule(uri);
    }
  });
}

async function handleHeadFile(uri) {
  if (!uri) return;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const raw = Buffer.from(bytes).toString('utf8').trim();
    let branch = null;
    if (raw.startsWith('ref:')) {
      const parts = raw.split(/\s+/);
      if (parts.length >= 2) {
        const ref = parts[1]; // refs/heads/<branch>
        const refParts = ref.split('/');
        const idx = refParts.indexOf('heads');
        if (idx >= 0 && idx + 1 < refParts.length) {
          branch = refParts.slice(idx + 1).join('/');
        } else {
          branch = refParts[refParts.length - 1];
        }
      }
    } else if (/^[0-9a-fA-F]{7,40}$/.test(raw)) {
      branch = raw.substring(0, 7);
    }

    // Use path to determine repo name if possible
    const pathParts = uri.fsPath.split(/[\\/]/);
    const gitIndex = pathParts.lastIndexOf('.git');
    const repoName = gitIndex > 0 ? pathParts[gitIndex - 1] : null;
    const prefix = vscode.workspace.getConfiguration('branchTerminal').get('terminalNamePrefix', 'git:');
    const label = branch ? `${prefix}${repoName ? repoName + '/' : ''}${branch}` : `${prefix}${repoName ? repoName + '/detached' : 'detached'}`;

    // Avoid duplicate restarts (key off the URI)
    const key = uri.fsPath;
    const s = repoState.get(key) || { lastLabel: null };
    if (s.lastLabel === label) return;
    s.lastLabel = label;
    repoState.set(key, s);

    // Kill all integrated terminals and open a new one (Original behavior)
    try {
      await vscode.commands.executeCommand('workbench.action.terminal.killAll');
    } catch (e) {
      console.error('branch-terminal: failed to kill terminals', e);
    }

    const terminal = vscode.window.createTerminal({ name: label });
    if (vscode.workspace.getConfiguration('branchTerminal').get('focusOnCreate', true)) {
      terminal.show(true);
    }
    const initCmd = vscode.workspace.getConfiguration('branchTerminal').get('initCommand', '');
    if (initCmd && initCmd.trim().length) {
      terminal.sendText(initCmd, true);
    }
  } catch (e) {
    console.error('branch-terminal: error reading HEAD file', e);
  }
}

function deactivate() {
  for (const [, s] of repoState) {
    if (s.timer) clearTimeout(s.timer);
    if (s.pollInterval) clearInterval(s.pollInterval);
  }
  repoState.clear();
  disposables.forEach(d => d && d.dispose && d.dispose());
  disposables = []; // Clear array
}

module.exports = { activate, deactivate };
