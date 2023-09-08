import { NodeMaterialBlock } from "../../nodeMaterialBlock";
import { NodeMaterialBlockConnectionPointTypes } from "../../Enums/nodeMaterialBlockConnectionPointTypes";
import type { NodeMaterialBuildState } from "../../nodeMaterialBuildState";
import { NodeMaterialBlockTargets } from "../../Enums/nodeMaterialBlockTargets";
import type { NodeMaterialConnectionPoint } from "../../nodeMaterialBlockConnectionPoint";
import { RegisterClass } from "../../../../Misc/typeStore";
import type { AbstractMesh } from "../../../../Meshes/abstractMesh";
import type { NodeMaterialDefines } from "../../nodeMaterial";
import { editableInPropertyPage, PropertyTypeForEdition } from "../../../../Decorators/nodeDecorator";
import { MaterialHelper } from "../../../materialHelper";

import type { NodeMaterial } from "../../nodeMaterial";
import type { Effect } from "../../../effect";
import type { Mesh } from "../../../../Meshes/mesh";
/**
 * Block used to return if fragment shader
 */
export class ReturnBlock extends NodeMaterialBlock {
    private _linearDefineName: string;
    private _gammaDefineName: string;

    /**
     * Create a new ReturnBlock
     * @param name defines the block name
     */
    public constructor(name: string) {
        super(name, NodeMaterialBlockTargets.Fragment, true);

        this.registerInput("rgba", NodeMaterialBlockConnectionPointTypes.Color4, true);
        this.registerInput("rgb", NodeMaterialBlockConnectionPointTypes.AutoDetect, true);
        this.registerInput("a", NodeMaterialBlockConnectionPointTypes.Float, true);
        this.registerInput("flag", NodeMaterialBlockConnectionPointTypes.Float, true);

        this.rgb.addExcludedConnectionPointFromAllowedTypes(
            NodeMaterialBlockConnectionPointTypes.Color3 | NodeMaterialBlockConnectionPointTypes.Vector3 | NodeMaterialBlockConnectionPointTypes.Float
        );
    }

    /** Gets or sets a boolean indicating if content needs to be converted to gamma space */
    @editableInPropertyPage("Convert to gamma space", PropertyTypeForEdition.Boolean, "PROPERTIES", { notifiers: { update: true } })
    public convertToGammaSpace = false;

    /** Gets or sets a boolean indicating if content needs to be converted to linear space */
    @editableInPropertyPage("Convert to linear space", PropertyTypeForEdition.Boolean, "PROPERTIES", { notifiers: { update: true } })
    public convertToLinearSpace = false;

    /** Gets or sets a boolean indicating if logarithmic depth should be used */
    @editableInPropertyPage("Use logarithmic depth", PropertyTypeForEdition.Boolean, "PROPERTIES")
    public useLogarithmicDepth = false;

    /**
     * Gets the current class name
     * @returns the class name
     */
    public getClassName() {
        return "ReturnBlock";
    }

    /**
     * Gets the rgba input component
     */
    public get rgba(): NodeMaterialConnectionPoint {
        return this._inputs[0];
    }

    /**
     * Gets the rgb input component
     */
    public get rgb(): NodeMaterialConnectionPoint {
        return this._inputs[1];
    }

    /**
     * Gets the a input component
     */
    public get a(): NodeMaterialConnectionPoint {
        return this._inputs[2];
    }

    /**
     * Gets the cutoff input component
     */
    public get flag(): NodeMaterialConnectionPoint {
        return this._inputs[3];
    }

    public prepareDefines(mesh: AbstractMesh, nodeMaterial: NodeMaterial, defines: NodeMaterialDefines) {
        defines.setValue(this._linearDefineName, this.convertToLinearSpace, true);
        defines.setValue(this._gammaDefineName, this.convertToGammaSpace, true);
    }

    public bind(effect: Effect, nodeMaterial: NodeMaterial, mesh?: Mesh) {
        if (this.useLogarithmicDepth && mesh) {
            MaterialHelper.BindLogDepth(undefined, effect, mesh.getScene());
        }
    }

    protected _buildBlock(state: NodeMaterialBuildState) {
        super._buildBlock(state);

        const rgba = this.rgba;
        const rgb = this.rgb;
        const a = this.a;

        state.sharedData.hints.needAlphaBlending = rgba.isConnected || a.isConnected;
        state.sharedData.blocksWithDefines.push(this);
        if (this.useLogarithmicDepth) {
            state._emitUniformFromString("logarithmicDepthConstant", "float");
            state._emitVaryingFromString("vFragmentDepth", "float");
            state.sharedData.bindableBlocks.push(this);
        }
        this._linearDefineName = state._getFreeDefineName("CONVERTTOLINEAR");
        this._gammaDefineName = state._getFreeDefineName("CONVERTTOGAMMA");

        const comments = `//${this.name}`;
        state._emitFunctionFromInclude("helperFunctions", comments);

        state.compilationString += `if (${this.flag.associatedVariableName} > 0.5) { \n`;

        if (rgba.connectedPoint) {
            if (a.isConnected) {
                state.compilationString += `gl_FragColor = vec4(${rgba.associatedVariableName}.rgb, ${a.associatedVariableName});\n`;
            } else {
                state.compilationString += `gl_FragColor = ${rgba.associatedVariableName};\n`;
            }
        } else if (rgb.connectedPoint) {
            let aValue = "1.0";

            if (a.connectedPoint) {
                aValue = a.associatedVariableName;
            }

            if (rgb.connectedPoint.type === NodeMaterialBlockConnectionPointTypes.Float) {
                state.compilationString += `gl_FragColor = vec4(${rgb.associatedVariableName}, ${rgb.associatedVariableName}, ${rgb.associatedVariableName}, ${aValue});\n`;
            } else {
                state.compilationString += `gl_FragColor = vec4(${rgb.associatedVariableName}, ${aValue});\n`;
            }
        } else {
            state.sharedData.checks.notConnectedNonOptionalInputs.push(rgba);
        }

        state.compilationString += `#ifdef ${this._linearDefineName}\n`;
        state.compilationString += `gl_FragColor = toLinearSpace(gl_FragColor);\n`;
        state.compilationString += `#endif\n`;

        state.compilationString += `#ifdef ${this._gammaDefineName}\n`;
        state.compilationString += `gl_FragColor = toGammaSpace(gl_FragColor);\n`;
        state.compilationString += `#endif\n`;

        if (this.useLogarithmicDepth) {
            state.compilationString += `gl_FragDepthEXT = log2(vFragmentDepth) * logarithmicDepthConstant * 0.5;\n`;
        }

        state.compilationString += `return; };\n`;

        return this;
    }

    public optimize(blocks : Array<NodeMaterialBlock>) {
        const rgba = this.rgba;
        const rgb = this.rgb;
        const a = this.a;

        if (!this.flag.isConnected) {
            return;
        }

        const result : NodeMaterialConnectionPoint[] = [];
        if (rgba.isConnected)
            rgba.getAllSourceConnections(result);
        if (rgb.isConnected)
            rgb.getAllSourceConnections(result); 
        if (a.isConnected)
            a.getAllSourceConnections(result);
        
        this.flag.getAllSourceConnections(result);
        const blocksBeforeThisBlock = result.map(connection => connection.sourceBlock);

        blocks.sort((a, b) => {
            const ai = blocksBeforeThisBlock.indexOf(a);
            const ab = blocksBeforeThisBlock.indexOf(b);

            if (a == this || b == this) {
                if (ai < 0 && ab < 0)
                    return -1;
                return 0;
            }
            

            if (ai >= 0 && ab >= 0)
                return 0;

            if (ab >= 0)
                return -1;

            return 0;
        });
    }

    /**
     * Initialize the block and prepare the context for build
     * @param state defines the state that will be used for the build
     */
    public initialize(state: NodeMaterialBuildState) {
        state._excludeVariableName("logarithmicDepthConstant");
        state._excludeVariableName("vFragmentDepth");
    }
}

RegisterClass("BABYLON.ReturnBlock", ReturnBlock);
