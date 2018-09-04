'use strict';
import { commands, ConfigurationChangeEvent } from 'vscode';
import { configuration, IExplorersConfig, ILineHistoryExplorerConfig } from '../configuration';
import { CommandContext, setCommandContext } from '../constants';
import { Container } from '../container';
import { ExplorerBase, RefreshReason } from './explorer';
import { ActiveLineHistoryNode } from './nodes/activeLineHistoryNode';

export class LineHistoryExplorer extends ExplorerBase {
    constructor() {
        super('gitlens.lineHistoryExplorer');
    }

    getRoot() {
        return new ActiveLineHistoryNode(this);
    }

    protected registerCommands() {
        Container.explorerCommands;
        commands.registerCommand(this.getQualifiedCommand('refresh'), this.refresh, this);
        commands.registerCommand(this.getQualifiedCommand('refreshNode'), this.refreshNode, this);

        commands.registerCommand(
            this.getQualifiedCommand('setRenameFollowingOn'),
            () => this.setRenameFollowing(true),
            this
        );
        commands.registerCommand(
            this.getQualifiedCommand('setRenameFollowingOff'),
            () => this.setRenameFollowing(false),
            this
        );
    }

    protected onConfigurationChanged(e: ConfigurationChangeEvent) {
        const initializing = configuration.initializing(e);

        if (
            !initializing &&
            !configuration.changed(e, configuration.name('lineHistoryExplorer').value) &&
            !configuration.changed(e, configuration.name('explorers').value) &&
            !configuration.changed(e, configuration.name('defaultGravatarsStyle').value) &&
            !configuration.changed(e, configuration.name('advanced')('fileHistoryFollowsRenames').value)
        ) {
            return;
        }

        if (
            initializing ||
            configuration.changed(e, configuration.name('lineHistoryExplorer')('enabled').value) ||
            configuration.changed(e, configuration.name('lineHistoryExplorer')('location').value)
        ) {
            setCommandContext(CommandContext.LineHistoryExplorer, this.config.enabled ? this.config.location : false);
        }

        if (initializing || configuration.changed(e, configuration.name('lineHistoryExplorer')('location').value)) {
            this.initialize(this.config.location);
        }

        if (!initializing && this._root !== undefined) {
            this.refresh(RefreshReason.ConfigurationChanged);
        }
    }

    get config(): IExplorersConfig & ILineHistoryExplorerConfig {
        return { ...Container.config.explorers, ...Container.config.lineHistoryExplorer };
    }

    private setRenameFollowing(enabled: boolean) {
        return configuration.updateEffective(
            configuration.name('advanced')('fileHistoryFollowsRenames').value,
            enabled
        );
    }
}
