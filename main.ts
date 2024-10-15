import { Transaction, StateEffect } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { App, Plugin, PluginSettingTab, request, Setting } from "obsidian";

interface ObeliskSettings {
	llamaPort: number;
	llamaVersion: string;
}

const DEFAULT_SETTINGS: ObeliskSettings = {
	llamaPort: 11434,
	llamaVersion: "3.2",
};

let currentSettings: ObeliskSettings = DEFAULT_SETTINGS;

export default class ObeliskPlugin extends Plugin {
	settings: ObeliskSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ObeliskSettingTab(this.app, this));

		console.log("Registering editor extension...");
		this.registerEditorExtension([completionViewPlugin]);

		console.log("Obelisk plugin loaded successfully");
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
		currentSettings = this.settings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		currentSettings = this.settings;
	}
}

class ObeliskSettingTab extends PluginSettingTab {
	plugin: ObeliskPlugin;

	constructor(app: App, plugin: ObeliskPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("ollama port")
			.setDesc("port number of the ollama server")
			.addText((text) =>
				text
					.setPlaceholder("Enter port number")
					.setValue(this.plugin.settings.llamaPort.toString())
					.onChange(async (value) => {
						this.plugin.settings.llamaPort = parseInt(value);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Llama Version")
			.setDesc("Model version to use for text completion")
			.addText((text) =>
				text
					.setPlaceholder("Enter model version")
					.setValue(this.plugin.settings.llamaVersion)
					.onChange(async (value) => {
						this.plugin.settings.llamaVersion = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

export class AppendTextWidget extends WidgetType {
	text: string;

	constructor(text: string) {
		super();
		this.text = text;
	}

	toDOM() {
		const span = document.createElement("span");
		span.textContent = this.text;
		span.className = "obelisk-completion-text"; // Add this line
		return span;
	}
}

class CompletionViewPlugin implements PluginValue {
	decorations: DecorationSet;
	completion: string | null = null;

	constructor(view: EditorView) {
		this.decorations = Decoration.none;
		this.generateCompletions(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			// Only generate completions if the document has changed
			this.generateCompletions(update.view);
		}
	}

	destroy() {
		// this.decorations.clear();
	}

	async generateCompletions(view: EditorView) {
		this.completion = await fetchCompletion(
			view.state.doc.sliceString(0, view.state.doc.length),
		);
		if (this.completion) {
			view.dispatch(this.addCompletionDecoration(view));
		}
	}

	addCompletionDecoration(view: EditorView): Transaction {
		const widget = Decoration.widget({
			widget: new AppendTextWidget(this.completion || ""),
			side: 1,
		});
		this.decorations = Decoration.set([
			widget.range(view.state.doc.length),
		]);

		return view.state.update({
			effects: StateEffect.appendConfig.of(
				EditorView.decorations.of(this.decorations),
			),
		});
	}
}

export const completionViewPlugin = ViewPlugin.fromClass(CompletionViewPlugin, {
	decorations: (v) => v.decorations,
});

async function fetchCompletion(prompt: string): Promise<string | null> {
	console.log("Fetching completion for:", prompt);
	const response = await request({
		url: `http://localhost:${currentSettings.llamaPort}/api/generate`,
		method: "POST",
		body: JSON.stringify({
			model: `llama${currentSettings.llamaVersion}`,
			prompt: prompt,
			stream: false,
			options: {
				temperature: 0.7,
			},
		}),
		headers: {
			"Content-Type": "application/json",
		},
	});

	const result = JSON.parse(response);
	return result.response || null;
}
