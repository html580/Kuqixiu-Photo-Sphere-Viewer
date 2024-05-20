import { PSVError, Point, Position, Size, Tooltip, TooltipConfig, utils, type Viewer } from '@photo-sphere-viewer/core';
import { Group, Vector3 } from 'three';
import { MarkerType, getMarkerType } from '../MarkerType';
import { type MarkersPlugin } from '../MarkersPlugin';
import { MarkerConfig, ParsedMarkerConfig } from '../model';

/**
 * Base class for all markers
 */
export abstract class Marker {
    readonly type: MarkerType;

    protected element: any;

    /**
     * The final description of the marker. Either text content, image, url, SVG attributes, etc.
     */
    definition: any;

    /** @internal */
    tooltip?: Tooltip;

    config: ParsedMarkerConfig;

    get id(): string {
        return this.config.id;
    }

    get data(): any {
        return this.config.data;
    }

    get domElement(): HTMLElement | SVGElement {
        return null;
    }

    get threeElement(): Group {
        return null;
    }

    get video(): HTMLVideoElement {
        return null;
    }

    /** @internal */
    readonly state = {
        dynamicSize: false,
        anchor: null as Point,
        visible: false,
        staticTooltip: false,
        position: null as Position,
        position2D: null as Point,
        positions3D: null as Vector3[],
        size: null as Size,
    };

    constructor(
        protected viewer: Viewer,
        protected plugin: MarkersPlugin,
        config: MarkerConfig
    ) {
        if (!config.id) {
            throw new PSVError('missing marker id');
        }

        this.type = getMarkerType(config);
        this.createElement();
        this.update(config);
    }

    /**
     * @internal
     */
    abstract createElement(): void;

    /**
     * @internal
     */
    abstract render(params: {
        viewerPosition: Position;
        zoomLevel: number;
        hoveringMarker: Marker;
    }): Point;

    /**
     * @internal
     */
    destroy() {
        delete this.viewer;
        delete this.plugin;

        this.hideTooltip();
    }

    /**
     * Checks if it is a 3D marker (imageLayer, videoLayer)
     */
    is3d(): boolean {
        return false;
    }

    /**
     * Checks if it is a normal marker (image, html, element)
     */
    isNormal(): boolean {
        return false;
    }

    /**
     * Checks if it is a polygon/polyline marker
     */
    isPoly(): boolean {
        return false;
    }

    /**
     * Checks if it is an SVG marker
     */
    isSvg(): boolean {
        return false;
    }

    /**
     * Updates the marker with new properties
     * @throws {@link PSVError} if the configuration is invalid
     * @internal
     */
    update(config: MarkerConfig) {
        const newType = getMarkerType(config, true);

        if (newType !== undefined && newType !== this.type) {
            throw new PSVError('cannot change marker type');
        }

        if (utils.isExtendedPosition(config)) {
            utils.logWarn('Use the "position" property to configure the position of a marker');
            config.position = this.viewer.dataHelper.cleanPosition(config);
        }

        if ('width' in config && 'height' in config) {
            utils.logWarn('Use the "size" property to configure the size of a marker');
            // @ts-ignore
            config.size = { width: config['width'], height: config['height'] };
        }

        this.config = utils.deepmerge(this.config, config as any);
        if (typeof this.config.tooltip === 'string') {
            this.config.tooltip = { content: this.config.tooltip };
        }
        if (this.config.tooltip && !this.config.tooltip.trigger) {
            this.config.tooltip.trigger = 'hover';
        }
        if (utils.isNil(this.config.visible)) {
            this.config.visible = true;
        }
        if (utils.isNil(this.config.zIndex)) {
            this.config.zIndex = 1;
        }
        if (utils.isNil(this.config.opacity)) {
            this.config.opacity = 1;
        }

        try {
            this.config.rotation = utils.parseAngle(this.config.rotation ?? 0);
        } catch (e) {
            utils.logWarn((e as PSVError).message);
            this.config.rotation = 0;
        }

        this.state.anchor = utils.parsePoint(this.config.anchor);
    }

    /**
     * Returns the markers list content for the marker, it can be either :
     * - the `listContent`
     * - the `tooltip`
     * - the `html`
     * - the `id`
     * @internal
     */
    getListContent(): string {
        if (this.config.listContent) {
            return this.config.listContent;
        } else if (this.config.tooltip?.content) {
            return this.config.tooltip.content;
        } else if (this.config.html) {
            return this.config.html;
        } else {
            return this.id;
        }
    }

    /**
     * Display the tooltip of this marker
     * @internal
     */
    showTooltip(clientX?: number, clientY?: number) {
        if (this.state.visible && this.config.tooltip?.content && this.state.position2D) {
            const config: TooltipConfig = {
                ...this.config.tooltip,
                style: {
                    // prevents conflicts with tooltip tracking
                    pointerEvents: this.state.staticTooltip ? 'auto' : 'none',
                },
                data: this,
                top: 0,
                left: 0,
            };

            if (this.isPoly() || this.is3d()) {
                if (clientX || clientY) {
                    const viewerPos = utils.getPosition(this.viewer.container);
                    config.top = clientY - viewerPos.y;
                    config.left = clientX - viewerPos.x;
                    config.box = {
                        // separate the tooltip from the cursor
                        width: 20,
                        height: 20,
                    };
                } else {
                    config.top = this.state.position2D.y;
                    config.left = this.state.position2D.x;
                }
            } else {
                // note: state.position2D already has the anchor applied with the default size
                const position = this.viewer.dataHelper.vector3ToViewerCoords(this.state.positions3D[0]);
                let width = this.state.size.width;
                let height = this.state.size.height;

                // only apply scaling for "temporary" tooltips
                if (this.config.hoverScale && !this.state.staticTooltip) {
                    width *= this.config.hoverScale.amount;
                    height *= this.config.hoverScale.amount;
                }

                config.top = position.y - height * this.state.anchor.y + height / 2;
                config.left = position.x - width * this.state.anchor.x + width / 2;
                config.box = { width, height };
            }

            if (this.tooltip) {
                this.tooltip.update(this.config.tooltip.content, config);
            } else {
                this.tooltip = this.viewer.createTooltip(config);
            }
        }
    }

    /**
     * Hides the tooltip of this marker
     * @internal
     */
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.hide();
            this.tooltip = null;
        }
    }
}
