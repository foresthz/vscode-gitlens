'use strict';
import { Disposable, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { Container } from '../../container';
import {
    GitCommitType,
    GitLogCommit,
    GitService,
    GitUri,
    RepositoryChange,
    RepositoryChangeEvent,
    RepositoryFileSystemChangeEvent
} from '../../gitService';
import { Logger } from '../../logger';
import { Iterables } from '../../system';
import { FileHistoryExplorer } from '../fileHistoryExplorer';
import { CommitFileNode, CommitFileNodeDisplayAs } from './commitFileNode';
import { MessageNode } from './common';
import { ExplorerNode, ResourceType, SubscribeableExplorerNode } from './explorerNode';

export class FileHistoryNode extends SubscribeableExplorerNode<FileHistoryExplorer> {
    constructor(uri: GitUri, explorer: FileHistoryExplorer) {
        super(uri, explorer);
    }

    async getChildren(): Promise<ExplorerNode[]> {
        const children: ExplorerNode[] = [];

        const displayAs =
            CommitFileNodeDisplayAs.CommitLabel |
            (this.explorer.config.avatars ? CommitFileNodeDisplayAs.Gravatar : CommitFileNodeDisplayAs.StatusIcon);

        const status = await Container.git.getStatusForFile(this.uri.repoPath!, this.uri.fsPath);
        if (status !== undefined && (status.indexStatus !== undefined || status.workTreeStatus !== undefined)) {
            let sha;
            let previousSha;
            if (status.workTreeStatus !== undefined) {
                sha = GitService.uncommittedSha;
                if (status.indexStatus !== undefined) {
                    previousSha = GitService.stagedUncommittedSha;
                }
                else if (status.workTreeStatus !== '?') {
                    previousSha = 'HEAD';
                }
            }
            else {
                sha = GitService.stagedUncommittedSha;
                previousSha = 'HEAD';
            }

            const commit = new GitLogCommit(
                GitCommitType.File,
                this.uri.repoPath!,
                sha,
                'You',
                undefined,
                new Date(),
                '',
                status.fileName,
                [status],
                status.status,
                status.originalFileName,
                previousSha,
                status.originalFileName || status.fileName
            );
            children.push(new CommitFileNode(status, commit, this.explorer, displayAs));
        }

        const log = await Container.git.getLogForFile(this.uri.repoPath, this.uri.fsPath, { ref: this.uri.sha });
        if (log !== undefined) {
            children.push(
                ...Iterables.map(
                    log.commits.values(),
                    c => new CommitFileNode(c.fileStatuses[0], c, this.explorer, displayAs)
                )
            );
        }

        if (children.length === 0) return [new MessageNode('No file history')];
        return children;
    }

    getTreeItem(): TreeItem {
        const item = new TreeItem(`${this.uri.getFormattedPath()}`, TreeItemCollapsibleState.Expanded);
        item.contextValue = ResourceType.FileHistory;
        item.tooltip = `History of ${this.uri.getFilename()}\n${this.uri.getDirectory()}/`;

        item.iconPath = {
            dark: Container.context.asAbsolutePath('images/dark/icon-history.svg'),
            light: Container.context.asAbsolutePath('images/light/icon-history.svg')
        };

        this.ensureSubscription();

        return item;
    }

    protected async subscribe() {
        const repo = await Container.git.getRepository(this.uri);
        if (repo === undefined) return undefined;

        const subscription = Disposable.from(
            repo.onDidChange(this.onRepoChanged, this),
            repo.onDidChangeFileSystem(this.onRepoFileSystemChanged, this),
            { dispose: () => repo.stopWatchingFileSystem() }
        );

        repo.startWatchingFileSystem();

        return subscription;
    }

    private onRepoChanged(e: RepositoryChangeEvent) {
        if (!e.changed(RepositoryChange.Repository)) return;

        Logger.log(`FileHistoryNode.onRepoChanged(${e.changes.join()}); triggering node refresh`);

        this.explorer.refreshNode(this);
    }

    private onRepoFileSystemChanged(e: RepositoryFileSystemChangeEvent) {
        if (!e.uris.some(uri => uri.toString() === this.uri.toString())) return;

        Logger.log(`FileHistoryNode.onRepoFileSystemChanged; triggering node refresh`);

        this.explorer.refreshNode(this);
    }
}
