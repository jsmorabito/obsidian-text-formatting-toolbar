import { App, Editor, MarkdownView, Platform, setIcon } from "obsidian";
import { TEXT_TOOLBAR_DEFAULT_COMMANDS } from "./constants";
import { TextToolbarExternalCommand } from "./types";
import {
	applyHeading,
	getHeadingLevel,
	getListType,
	toggleBlockquote,
	toggleCodeBlock,
	toggleInlineFormat,
	wrapLink,
} from "./formatting";
import type TextToolbarPlugin from "./main";

export default class TextToolbarManager {
	private plugin: TextToolbarPlugin;
	private toolbarEl: HTMLElement | null = null;
	private externalCommands: TextToolbarExternalCommand[] = [];
	private isMouseDown = false;
	private mouseDownInContent = false;
	private showTimeout: number | null = null;
	private lastTop = "-9999px";
	private lastLeft = "-9999px";
	private isPinned = false;
	private formatPending = false;
	private lastRect: DOMRect | null = null;
	private activeDropdown: HTMLElement | null = null;

	public constructor(plugin: TextToolbarPlugin) {
		this.plugin = plugin;
		this.init();
	}

	private init(): void {
		if (Platform.isMobile) return;

		this.createToolbar();

		this.plugin.registerDomEvent(activeDocument, "mousedown", (e: MouseEvent) => {
			if (this.toolbarEl?.contains(e.target as Node)) return;
			this.isMouseDown = true;
			this.isPinned = false;
			this.mouseDownInContent = !!(e.target as Element)?.closest(".cm-content");
			this.hide();
		});

		this.plugin.registerDomEvent(activeDocument, "mouseup", (e: MouseEvent) => {
			if (this.toolbarEl?.contains(e.target as Node)) return;
			this.isMouseDown = false;
			this.isPinned = false;
			if (!this.plugin.settings.enabled) return;
			if (!this.mouseDownInContent) return;
			if (this.showTimeout !== null) window.clearTimeout(this.showTimeout);
			this.showTimeout = window.setTimeout(() => this.checkAndShow(), 30);
		});

		this.plugin.registerDomEvent(window, "resize", () => {
			if (!this.toolbarEl?.hasClass("tt-visible")) return;
			this.isPinned = false;
			if (this.showTimeout !== null) window.clearTimeout(this.showTimeout);
			this.showTimeout = window.setTimeout(() => this.checkAndShow(), 100);
		});

		this.plugin.registerDomEvent(activeDocument, "focusin", (e: FocusEvent) => {
			if (this.toolbarEl?.contains(e.target as Node)) return;
			const workspaceEl = this.plugin.app.workspace.containerEl;
			if (!workspaceEl.contains(e.target as Node)) {
				this.isPinned = false;
				this.hide();
			}
		});

		this.plugin.registerDomEvent(activeDocument, "selectionchange", () => {
			if (this.isMouseDown) return;
			if (!this.plugin.settings.enabled) return;

			if (this.isPinned) {
				if (this.formatPending) return;
				const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
				const sel = activeView?.editor?.getSelection();
				if (!sel || !sel.trim()) {
					this.isPinned = false;
					this.hide();
				}
				return;
			}

			if (this.showTimeout !== null) window.clearTimeout(this.showTimeout);
			this.showTimeout = window.setTimeout(() => this.checkAndShow(), 80);
		});
	}

	private createToolbar(): void {
		this.toolbarEl = activeDocument.body.createDiv({ cls: "tt-toolbar" });
		this.renderButtons();
	}

	private renderButtons(): void {
		if (!this.toolbarEl) return;
		this.toolbarEl.empty();

		const hidden = this.plugin.settings.hideCommands ?? [];

		for (const cmd of TEXT_TOOLBAR_DEFAULT_COMMANDS) {
			if (hidden.includes(cmd.id)) continue;
			if (cmd.id === "heading-menu") {
				this.addHeadingDropdown();
			} else if (cmd.id === "list-menu") {
				this.addListDropdown();
			} else {
				this.addButton(cmd.icon, cmd.name, () => this.execDefaultCommand(cmd.id));
			}
		}

		if (this.externalCommands.length > 0) {
			this.toolbarEl.createDiv({ cls: "tt-toolbar-divider" });
			for (const cmd of this.externalCommands) {
				this.addButton(cmd.icon, cmd.name, () => {
					(this.plugin.app as App & { commands: { executeCommandById(id: string): boolean } }).commands.executeCommandById(cmd.id);
					this.hide();
				});
			}
		}
	}

	private addButton(icon: string, label: string, action: () => void): void {
		if (!this.toolbarEl) return;
		const btn = this.toolbarEl.createEl("button", {
			cls: "tt-toolbar-btn clickable-icon",
			attr: { "aria-label": label, "data-tooltip-position": "top" },
		});
		setIcon(btn, icon);
		btn.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			this.closeDropdown();
			action();
		});
	}

	private execDefaultCommand(id: string): void {
		if (id === "copy") { this.execCopy(); return; }
		if (id === "cut")  { this.execCut();  return; }

		const frozenTop  = this.lastTop;
		const frozenLeft = this.lastLeft;

		this.isPinned = true;
		this.formatPending = true;
		if (this.showTimeout !== null) {
			window.clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}

		switch (id) {
			case "bold":          this.toggleInlineFormat("**"); break;
			case "italic":        this.toggleInlineFormat("*");  break;
			case "strikethrough": this.toggleInlineFormat("~~"); break;
			case "highlight":     this.toggleInlineFormat("=="); break;
			case "code":          this.toggleInlineFormat("`");  break;
			case "comment":       this.toggleInlineFormat("%%"); break;
			case "link":          this.execLink();       return;
			case "code-block":    this.execCodeBlock();  return;
			case "blockquote":    this.execBlockquote(); return;
		}

		if (this.toolbarEl && frozenTop && frozenLeft) {
			this.toolbarEl.setCssProps({ "--tt-top": frozenTop, "--tt-left": frozenLeft });
			this.toolbarEl.addClass("tt-visible");
		}

		window.requestAnimationFrame(() => { this.formatPending = false; });
	}

	private toggleInlineFormat(marker: string): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const editor = view.editor;
		const sel = editor.getSelection();
		if (!sel) return;

		const from = editor.getCursor("from");
		const to   = editor.getCursor("to");
		const line = editor.getLine(from.line);

		const prefixMatch = sel.match(/^(#{1,6} |> |- \[[ xX]\] |[-*+] |\d+\. )/);
		const prefix = prefixMatch ? prefixMatch[0] : "";
		const contentCh = from.ch + prefix.length;
		const m = marker.length;

		const result = toggleInlineFormat({ sel, from, to, line }, marker);

		// Case 2: markers sit just outside the current selection — expand then replace
		if (
			from.line === to.line &&
			contentCh >= m && to.ch + m <= line.length &&
			line.substring(contentCh - m, contentCh) === marker &&
			line.substring(to.ch, to.ch + m) === marker &&
			result.replacement === sel.slice(prefix.length)
		) {
			editor.setSelection(
				{ line: from.line, ch: contentCh - m },
				{ line: to.line,   ch: to.ch + m },
			);
			editor.replaceSelection(result.replacement);
			editor.setSelection(result.newFrom, result.newTo);
			return;
		}

		editor.replaceSelection(result.replacement);
		editor.setSelection(result.newFrom, result.newTo);
	}

	private execBlockquote(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const editor = view.editor;
		const from = editor.getCursor("from");
		const to   = editor.getCursor("to");

		const lineNums = Array.from({ length: to.line - from.line + 1 }, (_, i) => from.line + i);
		const lineTexts = lineNums.map(n => editor.getLine(n));
		const toggled = toggleBlockquote(lineTexts);
		lineNums.forEach((n, i) => editor.setLine(n, toggled[i]));
		this.hide();
	}

	private execCodeBlock(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const editor = view.editor;
		editor.replaceSelection(toggleCodeBlock(editor.getSelection()));
		this.hide();
	}

	private execLink(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const editor = view.editor;
		const from = editor.getCursor("from");
		const [result, cursorCh] = wrapLink(editor.getSelection(), from.ch);
		editor.replaceSelection(result);
		editor.setCursor({ line: from.line, ch: cursorCh });
		this.hide();
	}

	private execCopy(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const text = view.editor.getSelection();
			void navigator.clipboard.writeText(text);
		}
		this.isPinned = true;
		this.formatPending = true;
		window.requestAnimationFrame(() => { this.formatPending = false; });
	}

	private execCut(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const text = view.editor.getSelection();
			void navigator.clipboard.writeText(text);
			view.editor.replaceSelection("");
		}
		this.hide();
	}

	private getCurrentHeadingLevel(editor: Editor): number | null {
		return getHeadingLevel(editor.getLine(editor.getCursor().line));
	}

	private getCurrentListType(editor: Editor): "bullet" | "numbered" | "checkbox" | null {
		return getListType(editor.getLine(editor.getCursor().line));
	}

	private addHeadingDropdown(): void {
		if (!this.toolbarEl) return;

		const wrapper = this.toolbarEl.createDiv({ cls: "tt-dropdown-wrapper" });

		const btn = wrapper.createEl("button", {
			cls: "tt-toolbar-btn tt-dropdown-trigger tt-heading-trigger clickable-icon",
			attr: { "aria-label": "Text style", "data-tooltip-position": "top" },
		});
		btn.createSpan({ text: "Aa", cls: "tt-heading-trigger-text" });
		setIcon(btn.createSpan({ cls: "tt-dropdown-trigger-caret" }), "chevron-down");

		const dropdown = wrapper.createDiv({ cls: "tt-dropdown tt-heading-dropdown" });

		const items: { label: string; level: number | null }[] = [
			{ label: "Regular text", level: null },
			{ label: "Heading 1",    level: 1 },
			{ label: "Heading 2",    level: 2 },
			{ label: "Heading 3",    level: 3 },
			{ label: "Heading 4",    level: 4 },
			{ label: "Heading 5",    level: 5 },
			{ label: "Heading 6",    level: 6 },
		];

		const checkEls: HTMLElement[] = [];

		for (const item of items) {
			const lvl = item.level;
			const cls = lvl === null
				? "tt-dropdown-item tt-heading-item-body"
				: `tt-dropdown-item tt-heading-item-h${lvl}`;
			const row = dropdown.createEl("button", { cls });
			const checkEl = row.createSpan({ cls: "tt-dropdown-check" });
			setIcon(checkEl, "check");
			checkEls.push(checkEl);
			row.createSpan({ text: item.label });

			row.addEventListener("mousedown", (e: MouseEvent) => {
				e.preventDefault();
				this.closeDropdown();
				this.setHeading(lvl);
			});
		}

		btn.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			if (!dropdown.hasClass("tt-open")) {
				const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
				const current = view ? this.getCurrentHeadingLevel(view.editor) : null;
				items.forEach((item, i) => {
					checkEls[i].toggleClass("tt-check-visible", item.level === current);
				});
				this.closeDropdown();
				dropdown.addClass("tt-open");
				this.activeDropdown = dropdown;
			} else {
				this.closeDropdown();
			}
		});
	}

	private setHeading(level: number | null): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const editor = view.editor;
		const from = editor.getCursor("from");
		const to   = editor.getCursor("to");

		for (let n = from.line; n <= to.line; n++) {
			editor.setLine(n, applyHeading(editor.getLine(n), level));
		}
		this.hide();
	}

	private addListDropdown(): void {
		if (!this.toolbarEl) return;

		const wrapper = this.toolbarEl.createDiv({ cls: "tt-dropdown-wrapper" });

		const btn = wrapper.createEl("button", {
			cls: "tt-toolbar-btn tt-dropdown-trigger clickable-icon",
			attr: { "aria-label": "Lists", "data-tooltip-position": "top" },
		});
		setIcon(btn.createSpan({ cls: "tt-dropdown-trigger-icon" }), "list");
		setIcon(btn.createSpan({ cls: "tt-dropdown-trigger-caret" }), "chevron-down");

		const dropdown = wrapper.createDiv({ cls: "tt-dropdown" });

		const items: { icon: string; label: string; cmd: string; type: "bullet" | "numbered" | "checkbox" }[] = [
			{ icon: "list",         label: "List",          cmd: "editor:toggle-bullet-list",      type: "bullet"   },
			{ icon: "list-ordered", label: "Numbered list", cmd: "editor:toggle-numbered-list",    type: "numbered" },
			{ icon: "check-square", label: "Checkbox",      cmd: "editor:toggle-checklist-status", type: "checkbox" },
		];

		const checkEls: HTMLElement[] = [];

		for (const item of items) {
			const row = dropdown.createEl("button", { cls: "tt-dropdown-item" });
			const checkEl = row.createSpan({ cls: "tt-dropdown-check" });
			setIcon(checkEl, "check");
			checkEls.push(checkEl);
			setIcon(row.createSpan({ cls: "tt-dropdown-icon" }), item.icon);
			row.createSpan({ text: item.label });

			row.addEventListener("mousedown", (e: MouseEvent) => {
				e.preventDefault();
				this.closeDropdown();
				(this.plugin.app as App & { commands: { executeCommandById(id: string): boolean } }).commands.executeCommandById(item.cmd);
				this.hide();
			});
		}

		btn.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			if (!dropdown.hasClass("tt-open")) {
				const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
				const current = view ? this.getCurrentListType(view.editor) : null;
				items.forEach((item, i) => {
					checkEls[i].toggleClass("tt-check-visible", item.type === current);
				});
				this.closeDropdown();
				dropdown.addClass("tt-open");
				this.activeDropdown = dropdown;
			} else {
				this.closeDropdown();
			}
		});
	}

	private closeDropdown(): void {
		if (this.activeDropdown) {
			this.activeDropdown.removeClass("tt-open");
			this.activeDropdown = null;
		}
	}

	private checkAndShow(): void {
		if (!this.plugin.settings.enabled) return;
		if (this.isPinned) return;

		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.editor) { this.hide(); return; }

		const selectedText = activeView.editor.getSelection();
		if (!selectedText || !selectedText.trim()) { this.hide(); return; }

		try {
			const sel = window.getSelection();
			if (!sel || sel.rangeCount === 0) { this.hide(); return; }
			const rect = sel.getRangeAt(0).getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) { this.hide(); return; }
			this.show(rect);
		} catch {
			this.hide();
		}
	}

	private show(rect: DOMRect): void {
		if (!this.toolbarEl) return;
		this.lastRect = rect;
		this.renderButtons();

		this.toolbarEl.setCssProps({ "--tt-top": "-9999px", "--tt-left": "-9999px" });
		this.toolbarEl.addClass("tt-visible");

		const tbHeight = this.toolbarEl.offsetHeight || 36;
		const tbWidth  = this.toolbarEl.offsetWidth  || 200;
		const gap = 8;

		let top  = rect.top - tbHeight - gap;
		let left = rect.left + rect.width / 2 - tbWidth / 2;

		if (top < gap) top = rect.bottom + gap;

		left = Math.max(gap, Math.min(left, window.innerWidth  - tbWidth  - gap));
		top  = Math.max(gap, Math.min(top,  window.innerHeight - tbHeight - gap));

		this.lastTop  = `${top}px`;
		this.lastLeft = `${left}px`;
		this.toolbarEl.setCssProps({ "--tt-top": this.lastTop, "--tt-left": this.lastLeft });
	}

	private hide(): void {
		if (this.toolbarEl) {
			this.toolbarEl.removeClass("tt-visible");
		}
		this.closeDropdown();
	}

	public destroy(): void {
		this.toolbarEl?.remove();
		this.toolbarEl = null;
		this.activeDropdown = null;
	}

	public refresh(): void {
		this.renderButtons();
	}

	public addExternalCommand(cmd: TextToolbarExternalCommand): void {
		if (!this.externalCommands.find(c => c.id === cmd.id)) {
			this.externalCommands.push(cmd);
			this.renderButtons();
		}
	}

	public removeExternalCommand(id: string): void {
		this.externalCommands = this.externalCommands.filter(c => c.id !== id);
		this.renderButtons();
	}

	public setExternalCommands(cmds: TextToolbarExternalCommand[]): void {
		this.externalCommands = [...cmds];
		this.renderButtons();
	}
}
