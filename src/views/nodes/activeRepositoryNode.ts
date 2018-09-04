'use strict';
import { TextEditor, TreeItem, TreeItemCollapsibleState, window } from 'vscode';
import { isTextEditor } from '../../constants';
import { Container } from '../../container';
import { GitUri } from '../../gitService';
import { Functions } from '../../system';
import { GitExplorer } from '../gitExplorer';
import { ExplorerNode, unknownGitUri } from './explorerNode';
import { RepositoryNode } from './repositoryNode';

export class ActiveRepositoryNode extends ExplorerNode {
    private _repositoryNode: RepositoryNode | undefined;

    constructor(
        private readonly explorer: GitExplorer
    ) {
        super(unknownGitUri);

        Container.context.subscriptions.push(
            window.onDidChangeActiveTextEditor(Functions.debounce(this.onActiveEditorChanged, 500), this)
        );

        void this.onActiveEditorChanged(window.activeTextEditor);
    }

    dispose() {
        // super.dispose();

        if (this._repositoryNode !== undefined) {
            this._repositoryNode.dispose();
            this._repositoryNode = undefined;
        }
    }

    get id(): string {
        return 'gitlens:repository:active';
    }

    private async onActiveEditorChanged(editor: TextEditor | undefined) {
        if (editor !== undefined && !isTextEditor(editor)) return;

        let changed = false;

        try {
            const repoPath = await Container.git.getActiveRepoPath(editor);
            if (repoPath === undefined) {
                if (this._repositoryNode !== undefined) {
                    changed = true;

                    this._repositoryNode.dispose();
                    this._repositoryNode = undefined;
                }

                return;
            }

            if (this._repositoryNode !== undefined && this._repositoryNode.repo.path === repoPath) return;

            const repo = await Container.git.getRepository(repoPath);
            if (repo === undefined || repo.closed) {
                if (this._repositoryNode !== undefined) {
                    changed = true;

                    this._repositoryNode.dispose();
                    this._repositoryNode = undefined;
                }

                return;
            }

            changed = true;
            if (this._repositoryNode !== undefined) {
                this._repositoryNode.dispose();
            }

            this._repositoryNode = new RepositoryNode(GitUri.fromRepoPath(repo.path), repo, this.explorer, true, this);
        }
        finally {
            if (changed) {
                this.explorer.refreshNode(this);
            }
        }
    }

    async getChildren(): Promise<ExplorerNode[]> {
        return this._repositoryNode !== undefined ? this._repositoryNode.getChildren() : [];
    }

    async getTreeItem(): Promise<TreeItem> {
        const item =
            this._repositoryNode !== undefined
                ? await this._repositoryNode.getTreeItem()
                : new TreeItem('No active repository', TreeItemCollapsibleState.None);
        item.id = this.id;
        return item;
    }
}
