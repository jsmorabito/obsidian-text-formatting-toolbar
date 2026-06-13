import { TextToolbarSettings } from "./types";

export const TEXT_TOOLBAR_DEFAULT_COMMANDS: {
	id: string;
	icon: string;
	name: string;
	description: string;
}[] = [
	{ id: "heading-menu",   icon: "type",          name: "Text Style",    description: "Set heading or paragraph style" },
	{ id: "bold",           icon: "bold",          name: "Bold",          description: "Toggle bold formatting" },
	{ id: "italic",         icon: "italic",        name: "Italic",        description: "Toggle italic formatting" },
	{ id: "underline",      icon: "underline",     name: "Underline",     description: "Toggle underline formatting" },
	{ id: "strikethrough",  icon: "strikethrough", name: "Strikethrough", description: "Toggle strikethrough formatting" },
	{ id: "highlight",      icon: "highlighter",   name: "Highlight",     description: "Toggle highlight formatting" },
	{ id: "link",           icon: "link-2",        name: "Link",          description: "Wrap selected text in a markdown link" },
	{ id: "code",           icon: "code",          name: "Inline Code",   description: "Toggle inline code formatting" },
	{ id: "code-block",     icon: "code-2",        name: "Code Block",    description: "Wrap selection in a fenced code block" },
	{ id: "comment",        icon: "message-square",name: "Comment",       description: "Wrap selection in an Obsidian comment (%% hidden from preview %%)" },
	{ id: "list-menu",      icon: "list",          name: "Lists",         description: "Insert a bullet list, numbered list, or checkbox" },
	{ id: "blockquote",     icon: "quote",         name: "Blockquote",    description: "Toggle blockquote on selected lines" },
	{ id: "copy",           icon: "copy",          name: "Copy",          description: "Copy selected text to clipboard" },
	{ id: "cut",            icon: "scissors",      name: "Cut",           description: "Cut selected text to clipboard" },
];

export const DEFAULT_SETTINGS: TextToolbarSettings = {
	enabled: false,
	hideCommands: [],
};
