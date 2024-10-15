import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginSpec,
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

export class EmojiWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const div = document.createElement("span");

		div.innerText = "👉";

		return div;
	}
}

class CompletionViewPlugin implements PluginValue {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {
		// this.decorations.clear();
	}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		if (view.state.doc.length === 0) {
			return RangeSet.empty;
		}

		const endPos = view.state.doc.length;
		const decoration = Decoration.widget({
			class: "completion-decoration",
			widget: new EmojiWidget(),
		});

		builder.add(0, endPos, decoration);
		return builder.finish();
	}
}

const pluginSpec: PluginSpec<CompletionViewPlugin> = {
	decorations: (value: CompletionViewPlugin) => value.decorations,
};

export const completionViewPlugin = ViewPlugin.fromClass(
	CompletionViewPlugin,
	pluginSpec,
);

async function fetchCompletion(query: string): Promise<string | null> {
	console.log("Fetching completion for:", query);
	const response = await request({
		url: `http://localhost:${currentSettings.llamaPort}/api/generate`,
		method: "POST",
		body: JSON.stringify({
			model: `llama${currentSettings.llamaVersion}`,
			prompt: query,
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
