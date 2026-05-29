import * as config from './config';

let localConfig: any;

export function init(configuration: any): void {
    localConfig = configuration;
}

export function getAttribute(tag: string, attribute: string, defaultValue: any, ignoreDefaultHighlight?: boolean): any {
    function getCustomHighlightSettings(customHighlight: any, tag: string): any {
        let result: any;
        Object.keys(customHighlight).forEach((t) => {
            let flags = '';
            if (localConfig.isRegexCaseSensitive() === false) {
                flags += 'i';
            }
            t = t.replace(/\\/g, '\\\\');
            t = t.replace(/[|{}()[\]^$+*?.-]/g, '\\$&');

            const regex = new RegExp(t, flags);

            if (tag.match(regex)) {
                result = customHighlight[tag];
            }
        });
        return result;
    }

    const tagSettings = getCustomHighlightSettings(localConfig.customHighlight(), tag);
    if (tagSettings && tagSettings[attribute] !== undefined) {
        return tagSettings[attribute];
    } else if (ignoreDefaultHighlight !== true) {
        const defaultHighlight = localConfig.defaultHighlight();
        if (defaultHighlight && defaultHighlight[attribute] !== undefined) {
            return defaultHighlight[attribute];
        }
    }
    return defaultValue;
}

export function getIcon(tag: string): string | undefined {
    return getAttribute(tag, 'icon', undefined);
}

export function getIconColour(tag: string): string {
    const useColourScheme = localConfig.shouldUseColourScheme();

    let colour = getAttribute(tag, 'iconColor', undefined);
    if (colour === undefined) {
        colour = getAttribute(tag, 'iconColour', undefined, useColourScheme);
    }
    if (colour === undefined && useColourScheme) {
        colour = getSchemeColour(tag, localConfig.backgroundColourScheme());
    }

    if (colour === undefined) {
        const foreground = getAttribute(tag, 'foreground', undefined, useColourScheme);
        const background = getAttribute(tag, 'background', undefined, useColourScheme);

        colour = foreground ? foreground : background ? background : 'green';
    }

    return colour;
}

export function getSchemeColour(tag: string, colours: string[]): string | undefined {
    const index = localConfig.tags().indexOf(tag);
    if (colours && colours.length > 0) {
        return colours[index % colours.length];
    }
    return undefined;
}

export function getForeground(tag: string): string | undefined {
    const useColourScheme = localConfig.shouldUseColourScheme();
    let colour = getAttribute(tag, 'foreground', undefined, useColourScheme);
    if (colour === undefined && useColourScheme) {
        colour = getSchemeColour(tag, localConfig.foregroundColourScheme());
    }
    return colour;
}

export function getBackground(tag: string): string | undefined {
    const useColourScheme = localConfig.shouldUseColourScheme();
    let colour = getAttribute(tag, 'background', undefined, useColourScheme);
    if (colour === undefined && useColourScheme) {
        colour = getSchemeColour(tag, localConfig.backgroundColourScheme());
    }
    return colour;
}
