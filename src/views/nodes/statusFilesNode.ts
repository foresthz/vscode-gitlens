'use strict';
import * as path from 'path';
import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { ExplorerFilesLayout } from '../../configuration';
import { Container } from '../../container';
import { GitStatusFile } from '../../git/git';
import {
    GitCommitType,
    GitLog,
    GitLogCommit,
    GitService,
    GitStatus,
    GitUri,
    IGitStatusFileWithCommit
} from '../../gitService';
import { Arrays, Iterables, Objects, Strings } from '../../system';
import { GitExplorer } from '../gitExplorer';
import { ExplorerNode, ResourceType } from './explorerNode';
import { FolderNode, IFileExplorerNode } from './folderNode';
import { StatusFileCommitsNode } from './statusFileCommitsNode';

export class StatusFilesNode extends ExplorerNode {
    readonly repoPath: string;

    constructor(
        public readonly status: GitStatus,
        public readonly range: string | undefined,
        private readonly explorer: GitExplorer,
        private readonly active: boolean = false
    ) {
        super(GitUri.fromRepoPath(status.repoPath));
        this.repoPath = status.repoPath;
    }

    get id(): string {
        return `gitlens:repository(${this.status.repoPath})${this.active ? ':active' : ''}:status:files`;
    }

    async getChildren(): Promise<ExplorerNode[]> {
        let statuses: IGitStatusFileWithCommit[] = [];

        const repoPath = this.repoPath;

        let log: GitLog | undefined;
        if (this.range !== undefined) {
            log = await Container.git.getLog(repoPath, { maxCount: 0, ref: this.range });
            if (log !== undefined) {
                statuses = [
                    ...Iterables.flatMap(log.commits.values(), c =>
                        c.fileStatuses.map(s => ({ ...s, commit: c } as IGitStatusFileWithCommit))
                    )
                ];
            }
        }

        if (this.status.files.length !== 0 && this.includeWorkingTree) {
            statuses.splice(
                0,
                0,
                ...Iterables.flatMap(this.status.files, s => {
                    if (s.workTreeStatus !== undefined && s.indexStatus !== undefined) {
                        // Decrements the date to guarantee this entry will be sorted after the previous entry (most recent first)
                        const older = new Date();
                        older.setMilliseconds(older.getMilliseconds() - 1);

                        return [
                            this.toStatusFile(s, GitService.uncommittedSha, GitService.stagedUncommittedSha),
                            this.toStatusFile(s, GitService.stagedUncommittedSha, 'HEAD', older)
                        ];
                    }
                    else if (s.indexStatus !== undefined) {
                        return [this.toStatusFile(s, GitService.stagedUncommittedSha, 'HEAD')];
                    }
                    else {
                        return [this.toStatusFile(s, GitService.uncommittedSha, 'HEAD')];
                    }
                })
            );
        }

        statuses.sort((a, b) => b.commit.date.getTime() - a.commit.date.getTime());

        const groups = Arrays.groupBy(statuses, s => s.fileName);

        let children: IFileExplorerNode[] = [
            ...Iterables.map(
                Objects.values(groups),
                statuses =>
                    new StatusFileCommitsNode(
                        repoPath,
                        statuses[statuses.length - 1],
                        statuses.map(s => s.commit),
                        this.explorer
                    )
            )
        ];

        if (this.explorer.config.files.layout !== ExplorerFilesLayout.List) {
            const hierarchy = Arrays.makeHierarchical(
                children,
                n => n.uri.getRelativePath().split('/'),
                (...paths: string[]) => Strings.normalizePath(path.join(...paths)),
                this.explorer.config.files.compact
            );

            const root = new FolderNode(repoPath, '', undefined, hierarchy, this.explorer);
            children = (await root.getChildren()) as IFileExplorerNode[];
        }
        else {
            children.sort((a, b) => (a.priority ? -1 : 1) - (b.priority ? -1 : 1) || a.label!.localeCompare(b.label!));
        }

        return children;
    }

    async getTreeItem(): Promise<TreeItem> {
        let files = this.status.files !== undefined && this.includeWorkingTree ? this.status.files.length : 0;

        if (this.status.upstream !== undefined && this.status.state.ahead > 0) {
            if (files > 0) {
                const aheadFiles = await Container.git.getDiffStatus(this.repoPath, `${this.status.upstream}...`);
                if (aheadFiles !== undefined) {
                    const uniques = new Set();
                    for (const f of this.status.files) {
                        uniques.add(f.fileName);
                    }
                    for (const f of aheadFiles) {
                        uniques.add(f.fileName);
                    }

                    files = uniques.size;
                }
            }
            else {
                const stats = await Container.git.getChangedFilesCount(this.repoPath, `${this.status.upstream}...`);
                if (stats !== undefined) {
                    files += stats.files;
                }
            }
        }

        const label = `${Strings.pluralize('file', files)} changed`;
        const item = new TreeItem(label, TreeItemCollapsibleState.Collapsed);
        item.id = this.id;
        item.contextValue = ResourceType.StatusFiles;
        item.iconPath = {
            dark: Container.context.asAbsolutePath(`images/dark/icon-diff.svg`),
            light: Container.context.asAbsolutePath(`images/light/icon-diff.svg`)
        };

        return item;
    }

    private get includeWorkingTree(): boolean {
        return this.explorer.config.includeWorkingTree;
    }

    private toStatusFile(s: GitStatusFile, ref: string, previousRef: string, date?: Date): IGitStatusFileWithCommit {
        return {
            status: s.status,
            repoPath: s.repoPath,
            indexStatus: s.indexStatus,
            workTreeStatus: s.workTreeStatus,
            fileName: s.fileName,
            originalFileName: s.originalFileName,
            commit: new GitLogCommit(
                GitCommitType.File,
                s.repoPath,
                ref,
                'You',
                undefined,
                date || new Date(),
                '',
                s.fileName,
                [s],
                s.status,
                s.originalFileName,
                previousRef,
                s.fileName
            )
        };
    }
}
