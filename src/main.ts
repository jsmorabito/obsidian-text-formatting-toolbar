import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, TEXT_TOOLBAR_DEFAULT_COMMANDS } from "./constants";
import { TextToolbarAPI, TextToolbarExternalCommand, TextToolbarSettings } from "./types";
import TextToolbarManager from "./textToolbarManager";

import "./styles.scss";

export default class TextToolbarPlugin extends Plugin {
	public settings: TextToolbarSettings;
	public manager: TextToolbarManager;

	/**
	 * Public API for other plugins (e.g. Commander) to inject commands into the toolbar.
	 * Access via: app.plugins.plugins['text-toolbar']?.api
	 */
	public readonly api: TextToolbarAPI = {
		addCommand: (cmd: TextToolbarExternalCommand) => this.manager.addExternalCommand(cmd),
		removeCommand: (id: string) => this.manager.removeExternalCommand(id),
		setCommands: (cmds: TextToolbarExternalCommand[]) => this.manager.setExternalCommands(cmds),
	};

	public async onload(): Promise<void> {
		await this.loadSettings();
		this.manager = new TextToolbarManager(this);
		this.addSettingTab(new TextToolbarSettingTab(this.app, this));
	}

	public onunload(): void {
		this.manager.destroy();
	}

	public async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TextToolbarSettings>);
		this.settings.hideCommands ??= [];
	}

	public async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class TextToolbarSettingTab extends PluginSettingTab {
	private plugin: TextToolbarPlugin;

	constructor(app: App, plugin: TextToolbarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable text toolbar")
			.setDesc("Show a floating formatting toolbar when text is selected in the editor.")
			.addToggle(t =>
				t
					.setValue(this.plugin.settings.enabled)
					.onChange(async v => {
						this.plugin.settings.enabled = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default commands")
			.setHeading()
			.setDesc("Toggle which built-in formatting buttons appear in the toolbar.");

		for (const cmd of TEXT_TOOLBAR_DEFAULT_COMMANDS) {
			new Setting(containerEl)
				.setName(cmd.name)
				.setDesc(cmd.description)
				.addToggle(t =>
					t
						.setValue(!this.plugin.settings.hideCommands.includes(cmd.id))
						.onChange(async v => {
							if (v) {
								this.plugin.settings.hideCommands = this.plugin.settings.hideCommands.filter(
									id => id !== cmd.id
								);
							} else if (!this.plugin.settings.hideCommands.includes(cmd.id)) {
								this.plugin.settings.hideCommands.push(cmd.id);
							}
							await this.plugin.saveSettings();
							this.plugin.manager.refresh();
						})
				);
		}
	}
}
