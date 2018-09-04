'use strict';
import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { Container } from '../../container';
import { GitUri, Repository } from '../../gitService';
import { Iterables } from '../../system';
import { Explorer } from '../explorer';
import { MessageNode } from './common';
import { ExplorerNode, ResourceType } from './explorerNode';
import { StashNode } from './stashNode';

export class StashesNode extends ExplorerNode {
    constructor(
        uri: GitUri,
        private readonly repo: Repository,
        private readonly explorer: Explorer
    ) {
        super(uri);
    }

    get id(): string {
        return `gitlens:repository(${this.repo.path}):stashes`;
    }

    async getChildren(): Promise<ExplorerNode[]> {
        const stash = await this.repo.getStashList();
        if (stash === undefined) return [new MessageNode('No stashed changes')];

        return [...Iterables.map(stash.commits.values(), c => new StashNode(c, this.explorer))];
    }

    getTreeItem(): TreeItem {
        const item = new TreeItem(`Stashes`, TreeItemCollapsibleState.Collapsed);
        item.id = this.id;
        item.contextValue = ResourceType.Stashes;

        item.iconPath = {
            dark: Container.context.asAbsolutePath('images/dark/icon-stash.svg'),
            light: Container.context.asAbsolutePath('images/light/icon-stash.svg')
        };

        return item;
    }
}
