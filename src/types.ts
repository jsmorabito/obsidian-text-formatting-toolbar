export interface TextToolbarSettings {
	enabled: boolean;
	hideCommands: string[];
}

export interface TextToolbarExternalCommand {
	id: string;
	icon: string;
	name: string;
}

export interface TextToolbarAPI {
	addCommand(cmd: TextToolbarExternalCommand): void;
	removeCommand(id: string): void;
	setCommands(cmds: TextToolbarExternalCommand[]): void;
}
