import type { IEasingFunction, EasingFunction } from "./easing";
import { Vector3, Quaternion, Vector2, Matrix, TmpVectors } from "../Maths/math.vector";
import { Color3, Color4 } from "../Maths/math.color";
import { Scalar } from "../Maths/math.scalar";

import type { Nullable } from "../types";
import type { Scene } from "../scene";
import { SerializationHelper } from "../Misc/decorators";
import { RegisterClass } from "../Misc/typeStore";
import type { IAnimationKey } from "./animationKey";
import { AnimationKeyInterpolation } from "./animationKey";
import { AnimationRange } from "./animationRange";
import type { AnimationEvent } from "./animationEvent";
import { Node } from "../node";
import type { IAnimatable } from "./animatable.interface";
import { Size } from "../Maths/math.size";
import { WebRequest } from "../Misc/webRequest";
import { Constants } from "../Engines/constants";

import type { Animatable } from "./animatable";
import type { RuntimeAnimation } from "./runtimeAnimation";

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class _IAnimationState {
    key: number;
    repeatCount: number;
    workValue?: any;
    loopMode?: number;
    offsetValue?: any;
    highLimitValue?: any;
}

/**
 * Class used to store any kind of animation
 */
export class Animation {
    private static _UniqueIdGenerator = 0;

    /**
     * Use matrix interpolation instead of using direct key value when animating matrices
     */
    public static AllowMatricesInterpolation = false;

    /**
     * When matrix interpolation is enabled, this boolean forces the system to use Matrix.DecomposeLerp instead of Matrix.Lerp. Interpolation is more precise but slower
     */
    public static AllowMatrixDecomposeForInterpolation = true;

    /**
     * Gets or sets the unique id of the animation (the uniqueness is solely among other animations)
     */
    public uniqueId: number;

    /** Define the Url to load snippets */
    public static SnippetUrl = Constants.SnippetUrl;

    /** Snippet ID if the animation was created from the snippet server */
    public snippetId: string;

    /**
     * Stores the key frames of the animation
     */
    private _keys: Array<IAnimationKey>;

    /**
     * Stores the easing function of the animation
     */
    private _easingFunction: Nullable<IEasingFunction> = null;

    /**
     * @internal Internal use only
     */
    public _runtimeAnimations = new Array<RuntimeAnimation>();

    /**
     * The set of event that will be linked to this animation
     */
    private _events = new Array<AnimationEvent>();

    /**
     * Stores an array of target property paths
     */
    public targetPropertyPath: string[];

    /**
     * Stores the blending speed of the animation
     */
    public blendingSpeed = 0.01;

    /**
     * Stores the animation ranges for the animation
     */
    private _ranges: { [name: string]: Nullable<AnimationRange> } = {};

    /**
     * @internal Internal use
     */
    public static _PrepareAnimation(
        name: string,
        targetProperty: string,
        framePerSecond: number,
        totalFrame: number,
        from: any,
        to: any,
        loopMode?: number,
        easingFunction?: EasingFunction
    ): Nullable<Animation> {
        let dataType = undefined;

        if (!isNaN(parseFloat(from)) && isFinite(from)) {
            dataType = Animation.ANIMATIONTYPE_FLOAT;
        } else if (from instanceof Quaternion) {
            dataType = Animation.ANIMATIONTYPE_QUATERNION;
        } else if (from instanceof Vector3) {
            dataType = Animation.ANIMATIONTYPE_VECTOR3;
        } else if (from instanceof Vector2) {
            dataType = Animation.ANIMATIONTYPE_VECTOR2;
        } else if (from instanceof Color3) {
            dataType = Animation.ANIMATIONTYPE_COLOR3;
        } else if (from instanceof Color4) {
            dataType = Animation.ANIMATIONTYPE_COLOR4;
        } else if (from instanceof Size) {
            dataType = Animation.ANIMATIONTYPE_SIZE;
        }

        if (dataType == undefined) {
            return null;
        }

        const animation = new Animation(name, targetProperty, framePerSecond, dataType, loopMode);

        const keys: Array<IAnimationKey> = [
            { frame: 0, value: from },
            { frame: totalFrame, value: to },
        ];
        animation.setKeys(keys);

        if (easingFunction !== undefined) {
            animation.setEasingFunction(easingFunction);
        }

        return animation;
    }

    /**
     * Sets up an animation
     * @param property The property to animate
     * @param animationType The animation type to apply
     * @param framePerSecond The frames per second of the animation
     * @param easingFunction The easing function used in the animation
     * @returns The created animation
     */
    public static CreateAnimation(property: string, animationType: number, framePerSecond: number, easingFunction: EasingFunction): Animation {
        const animation: Animation = new Animation(property + "Animation", property, framePerSecond, animationType, Animation.ANIMATIONLOOPMODE_CONSTANT);

        animation.setEasingFunction(easingFunction);

        return animation;
    }

    /**
     * Create and start an animation on a node
     * @param name defines the name of the global animation that will be run on all nodes
     * @param target defines the target where the animation will take place
     * @param targetProperty defines property to animate
     * @param framePerSecond defines the number of frame per second yo use
     * @param totalFrame defines the number of frames in total
     * @param from defines the initial value
     * @param to defines the final value
     * @param loopMode defines which loop mode you want to use (off by default)
     * @param easingFunction defines the easing function to use (linear by default)
     * @param onAnimationEnd defines the callback to call when animation end
     * @param scene defines the hosting scene
     * @returns the animatable created for this animation
     */
    public static CreateAndStartAnimation(
        name: string,
        target: any,
        targetProperty: string,
        framePerSecond: number,
        totalFrame: number,
        from: any,
        to: any,
        loopMode?: number,
        easingFunction?: EasingFunction,
        onAnimationEnd?: () => void,
        scene?: Scene
    ): Nullable<Animatable> {
        const animation = Animation._PrepareAnimation(name, targetProperty, framePerSecond, totalFrame, from, to, loopMode, easingFunction);

        if (!animation) {
            return null;
        }

        if (target.getScene) {
            scene = target.getScene();
        }

        if (!scene) {
            return null;
        }

        return scene.beginDirectAnimation(target, [animation], 0, totalFrame, animation.loopMode === 1, 1.0, onAnimationEnd);
    }

    /**
     * Create and start an animation on a node and its descendants
     * @param name defines the name of the global animation that will be run on all nodes
     * @param node defines the root node where the animation will take place
     * @param directDescendantsOnly if true only direct descendants will be used, if false direct and also indirect (children of children, an so on in a recursive manner) descendants will be used
     * @param targetProperty defines property to animate
     * @param framePerSecond defines the number of frame per second to use
     * @param totalFrame defines the number of frames in total
     * @param from defines the initial value
     * @param to defines the final value
     * @param loopMode defines which loop mode you want to use (off by default)
     * @param easingFunction defines the easing function to use (linear by default)
     * @param onAnimationEnd defines the callback to call when an animation ends (will be called once per node)
     * @returns the list of animatables created for all nodes
     * @example https://www.babylonjs-playground.com/#MH0VLI
     */
    public static CreateAndStartHierarchyAnimation(
        name: string,
        node: Node,
        directDescendantsOnly: boolean,
        targetProperty: string,
        framePerSecond: number,
        totalFrame: number,
        from: any,
        to: any,
        loopMode?: number,
        easingFunction?: EasingFunction,
        onAnimationEnd?: () => void
    ): Nullable<Animatable[]> {
        const animation = Animation._PrepareAnimation(name, targetProperty, framePerSecond, totalFrame, from, to, loopMode, easingFunction);

        if (!animation) {
            return null;
        }

        const scene = node.getScene();
        return scene.beginDirectHierarchyAnimation(node, directDescendantsOnly, [animation], 0, totalFrame, animation.loopMode === 1, 1.0, onAnimationEnd);
    }

    /**
     * Creates a new animation, merges it with the existing animations and starts it
     * @param name Name of the animation
     * @param node Node which contains the scene that begins the animations
     * @param targetProperty Specifies which property to animate
     * @param framePerSecond The frames per second of the animation
     * @param totalFrame The total number of frames
     * @param from The frame at the beginning of the animation
     * @param to The frame at the end of the animation
     * @param loopMode Specifies the loop mode of the animation
     * @param easingFunction (Optional) The easing function of the animation, which allow custom mathematical formulas for animations
     * @param onAnimationEnd Callback to run once the animation is complete
     * @returns Nullable animation
     */
    public static CreateMergeAndStartAnimation(
        name: string,
        node: Node,
        targetProperty: string,
        framePerSecond: number,
        totalFrame: number,
        from: any,
        to: any,
        loopMode?: number,
        easingFunction?: EasingFunction,
        onAnimationEnd?: () => void
    ): Nullable<Animatable> {
        const animation = Animation._PrepareAnimation(name, targetProperty, framePerSecond, totalFrame, from, to, loopMode, easingFunction);

        if (!animation) {
            return null;
        }

        node.animations.push(animation);

        return node.getScene().beginAnimation(node, 0, totalFrame, animation.loopMode === 1, 1.0, onAnimationEnd);
    }

    /**
     * Convert the keyframes for all animations belonging to the group to be relative to a given reference frame.
     * @param sourceAnimation defines the Animation containing keyframes to convert
     * @param referenceFrame defines the frame that keyframes in the range will be relative to
     * @param range defines the name of the AnimationRange belonging to the Animation to convert
     * @param cloneOriginal defines whether or not to clone the animation and convert the clone or convert the original animation (default is false)
     * @param clonedName defines the name of the resulting cloned Animation if cloneOriginal is true
     * @returns a new Animation if cloneOriginal is true or the original Animation if cloneOriginal is false
     */
    public static MakeAnimationAdditive(sourceAnimation: Animation, referenceFrame = 0, range?: string, cloneOriginal = false, clonedName?: string): Animation {
        let animation = sourceAnimation;

        if (cloneOriginal) {
            animation = sourceAnimation.clone();
            animation.name = clonedName || animation.name;
        }

        if (!animation._keys.length) {
            return animation;
        }

        referenceFrame = referenceFrame >= 0 ? referenceFrame : 0;
        let startIndex = 0;
        const firstKey = animation._keys[0];
        let endIndex = animation._keys.length - 1;
        const lastKey = animation._keys[endIndex];
        const valueStore = {
            referenceValue: firstKey.value,
            referencePosition: TmpVectors.Vector3[0],
            referenceQuaternion: TmpVectors.Quaternion[0],
            referenceScaling: TmpVectors.Vector3[1],
            keyPosition: TmpVectors.Vector3[2],
            keyQuaternion: TmpVectors.Quaternion[1],
            keyScaling: TmpVectors.Vector3[3],
        };
        let referenceFound = false;
        let from = firstKey.frame;
        let to = lastKey.frame;
        if (range) {
            const rangeValue = animation.getRange(range);

            if (rangeValue) {
                from = rangeValue.from;
                to = rangeValue.to;
            }
        }
        let fromKeyFound = firstKey.frame === from;
        let toKeyFound = lastKey.frame === to;

        // There's only one key, so use it
        if (animation._keys.length === 1) {
            const value = animation._getKeyValue(animation._keys[0]);
            valueStore.referenceValue = value.clone ? value.clone() : value;
            referenceFound = true;
        }

        // Reference frame is before the first frame, so just use the first frame
        else if (referenceFrame <= firstKey.frame) {
            const value = animation._getKeyValue(firstKey.value);
            valueStore.referenceValue = value.clone ? value.clone() : value;
            referenceFound = true;
        }

        // Reference frame is after the last frame, so just use the last frame
        else if (referenceFrame >= lastKey.frame) {
            const value = animation._getKeyValue(lastKey.value);
            valueStore.referenceValue = value.clone ? value.clone() : value;
            referenceFound = true;
        }

        // Find key bookends, create them if they don't exist
        let index = 0;
        while (!referenceFound || !fromKeyFound || (!toKeyFound && index < animation._keys.length - 1)) {
            const currentKey = animation._keys[index];
            const nextKey = animation._keys[index + 1];

            // If reference frame wasn't found yet, check if we can interpolate to it
            if (!referenceFound && referenceFrame >= currentKey.frame && referenceFrame <= nextKey.frame) {
                let value;

                if (referenceFrame === currentKey.frame) {
                    value = animation._getKeyValue(currentKey.value);
                } else if (referenceFrame === nextKey.frame) {
                    value = animation._getKeyValue(nextKey.value);
                } else {
                    const animationState = {
                        key: index,
                        repeatCount: 0,
                        loopMode: this.ANIMATIONLOOPMODE_CONSTANT,
                    };
                    value = animation._interpolate(referenceFrame, animationState);
                }

                valueStore.referenceValue = value.clone ? value.clone() : value;
                referenceFound = true;
            }

            // If from key wasn't found yet, check if we can interpolate to it
            if (!fromKeyFound && from >= currentKey.frame && from <= nextKey.frame) {
                if (from === currentKey.frame) {
                    startIndex = index;
                } else if (from === nextKey.frame) {
                    startIndex = index + 1;
                } else {
                    const animationState = {
                        key: index,
                        repeatCount: 0,
                        loopMode: this.ANIMATIONLOOPMODE_CONSTANT,
                    };
                    const value = animation._interpolate(from, animationState);
                    const key: IAnimationKey = {
                        frame: from,
                        value: value.clone ? value.clone() : value,
                    };
                    animation._keys.splice(index + 1, 0, key);
                    startIndex = index + 1;
                }

                fromKeyFound = true;
            }

            // If to key wasn't found yet, check if we can interpolate to it
            if (!toKeyFound && to >= currentKey.frame && to <= nextKey.frame) {
                if (to === currentKey.frame) {
                    endIndex = index;
                } else if (to === nextKey.frame) {
                    endIndex = index + 1;
                } else {
                    const animationState = {
                        key: index,
                        repeatCount: 0,
                        loopMode: this.ANIMATIONLOOPMODE_CONSTANT,
                    };
                    const value = animation._interpolate(to, animationState);
                    const key: IAnimationKey = {
                        frame: to,
                        value: value.clone ? value.clone() : value,
                    };
                    animation._keys.splice(index + 1, 0, key);
                    endIndex = index + 1;
                }

                toKeyFound = true;
            }

            index++;
        }

        // Conjugate the quaternion
        if (animation.dataType === Animation.ANIMATIONTYPE_QUATERNION) {
            valueStore.referenceValue.normalize().conjugateInPlace();
        }

        // Decompose matrix and conjugate the quaternion
        else if (animation.dataType === Animation.ANIMATIONTYPE_MATRIX) {
            valueStore.referenceValue.decompose(valueStore.referenceScaling, valueStore.referenceQuaternion, valueStore.referencePosition);
            valueStore.referenceQuaternion.normalize().conjugateInPlace();
        }

        // Subtract the reference value from all of the key values
        for (index = startIndex; index <= endIndex; index++) {
            const key = animation._keys[index];

            // If this key was duplicated to create a frame 0 key, skip it because its value has already been updated
            if (index && animation.dataType !== Animation.ANIMATIONTYPE_FLOAT && key.value === firstKey.value) {
                continue;
            }

            switch (animation.dataType) {
                case Animation.ANIMATIONTYPE_MATRIX:
                    key.value.decompose(valueStore.keyScaling, valueStore.keyQuaternion, valueStore.keyPosition);
                    valueStore.keyPosition.subtractInPlace(valueStore.referencePosition);
                    valueStore.keyScaling.divideInPlace(valueStore.referenceScaling);
                    valueStore.referenceQuaternion.multiplyToRef(valueStore.keyQuaternion, valueStore.keyQuaternion);
                    Matrix.ComposeToRef(valueStore.keyScaling, valueStore.keyQuaternion, valueStore.keyPosition, key.value);
                    break;

                case Animation.ANIMATIONTYPE_QUATERNION:
                    valueStore.referenceValue.multiplyToRef(key.value, key.value);
                    break;

                case Animation.ANIMATIONTYPE_VECTOR2:
                case Animation.ANIMATIONTYPE_VECTOR3:
                case Animation.ANIMATIONTYPE_COLOR3:
                case Animation.ANIMATIONTYPE_COLOR4:
                    key.value.subtractToRef(valueStore.referenceValue, key.value);
                    break;

                case Animation.ANIMATIONTYPE_SIZE:
                    key.value.width -= valueStore.referenceValue.width;
                    key.value.height -= valueStore.referenceValue.height;
                    break;

                default:
                    key.value -= valueStore.referenceValue;
            }
        }

        return animation;
    }

    /**
     * Transition property of an host to the target Value
     * @param property The property to transition
     * @param targetValue The target Value of the property
     * @param host The object where the property to animate belongs
     * @param scene Scene used to run the animation
     * @param frameRate Framerate (in frame/s) to use
     * @param transition The transition type we want to use
     * @param duration The duration of the animation, in milliseconds
     * @param onAnimationEnd Callback trigger at the end of the animation
     * @returns Nullable animation
     */
    public static TransitionTo(
        property: string,
        targetValue: any,
        host: any,
        scene: Scene,
        frameRate: number,
        transition: Animation,
        duration: number,
        onAnimationEnd: Nullable<() => void> = null
    ): Nullable<Animatable> {
        if (duration <= 0) {
            host[property] = targetValue;
            if (onAnimationEnd) {
                onAnimationEnd();
            }
            return null;
        }

        const endFrame: number = frameRate * (duration / 1000);

        transition.setKeys([
            {
                frame: 0,
                value: host[property].clone ? host[property].clone() : host[property],
            },
            {
                frame: endFrame,
                value: targetValue,
            },
        ]);

        if (!host.animations) {
            host.animations = [];
        }

        host.animations.push(transition);

        const animation: Animatable = scene.beginAnimation(host, 0, endFrame, false);
        animation.onAnimationEnd = onAnimationEnd;
        return animation;
    }

    /**
     * Return the array of runtime animations currently using this animation
     */
    public get runtimeAnimations(): RuntimeAnimation[] {
        return this._runtimeAnimations;
    }

    /**
     * Specifies if any of the runtime animations are currently running
     */
    public get hasRunningRuntimeAnimations(): boolean {
        for (const runtimeAnimation of this._runtimeAnimations) {
            if (!runtimeAnimation.isStopped()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Initializes the animation
     * @param name Name of the animation
     * @param targetProperty Property to animate
     * @param framePerSecond The frames per second of the animation
     * @param dataType The data type of the animation
     * @param loopMode The loop mode of the animation
     * @param enableBlending Specifies if blending should be enabled
     */
    constructor(
        /**Name of the animation */
        public name: string,
        /**Property to animate */
        public targetProperty: string,
        /**The frames per second of the animation */
        public framePerSecond: number,
        /**The data type of the animation */
        public dataType: number,
        /**The loop mode of the animation */
        public loopMode?: number,
        /**Specifies if blending should be enabled */
        public enableBlending?: boolean
    ) {
        this.targetPropertyPath = targetProperty.split(".");
        this.dataType = dataType;
        this.loopMode = loopMode === undefined ? Animation.ANIMATIONLOOPMODE_CYCLE : loopMode;
        this.uniqueId = Animation._UniqueIdGenerator++;
    }

    // Methods
    /**
     * Converts the animation to a string
     * @param fullDetails support for multiple levels of logging within scene loading
     * @returns String form of the animation
     */
    public toString(fullDetails?: boolean): string {
        let ret = "Name: " + this.name + ", property: " + this.targetProperty;
        ret += ", datatype: " + ["Float", "Vector3", "Quaternion", "Matrix", "Color3", "Vector2"][this.dataType];
        ret += ", nKeys: " + (this._keys ? this._keys.length : "none");
        ret += ", nRanges: " + (this._ranges ? Object.keys(this._ranges).length : "none");
        if (fullDetails) {
            ret += ", Ranges: {";
            let first = true;
            for (const name in this._ranges) {
                if (first) {
                    ret += ", ";
                    first = false;
                }
                ret += name;
            }
            ret += "}";
        }
        return ret;
    }

    /**
     * Add an event to this animation
     * @param event Event to add
     */
    public addEvent(event: AnimationEvent): void {
        this._events.push(event);
        this._events.sort((a, b) => a.frame - b.frame);
    }

    /**
     * Remove all events found at the given frame
     * @param frame The frame to remove events from
     */
    public removeEvents(frame: number): void {
        for (let index = 0; index < this._events.length; index++) {
            if (this._events[index].frame === frame) {
                this._events.splice(index, 1);
                index--;
            }
        }
    }

    /**
     * Retrieves all the events from the animation
     * @returns Events from the animation
     */
    public getEvents(): AnimationEvent[] {
        return this._events;
    }

    /**
     * Creates an animation range
     * @param name Name of the animation range
     * @param from Starting frame of the animation range
     * @param to Ending frame of the animation
     */
    public createRange(name: string, from: number, to: number): void {
        // check name not already in use; could happen for bones after serialized
        if (!this._ranges[name]) {
            this._ranges[name] = new AnimationRange(name, from, to);
        }
    }

    /**
     * Deletes an animation range by name
     * @param name Name of the animation range to delete
     * @param deleteFrames Specifies if the key frames for the range should also be deleted (true) or not (false)
     */
    public deleteRange(name: string, deleteFrames = true): void {
        const range = this._ranges[name];
        if (!range) {
            return;
        }
        if (deleteFrames) {
            const from = range.from;
            const to = range.to;

            // this loop MUST go high to low for multiple splices to work
            for (let key = this._keys.length - 1; key >= 0; key--) {
                if (this._keys[key].frame >= from && this._keys[key].frame <= to) {
                    this._keys.splice(key, 1);
                }
            }
        }
        this._ranges[name] = null; // said much faster than 'delete this._range[name]'
    }

    /**
     * Gets the animation range by name, or null if not defined
     * @param name Name of the animation range
     * @returns Nullable animation range
     */
    public getRange(name: string): Nullable<AnimationRange> {
        return this._ranges[name];
    }

    /**
     * Gets the key frames from the animation
     * @returns The key frames of the animation
     */
    public getKeys(): Array<IAnimationKey> {
        return this._keys;
    }

    /**
     * Gets the highest frame rate of the animation
     * @returns Highest frame rate of the animation
     */
    public getHighestFrame(): number {
        let ret = 0;

        for (let key = 0, nKeys = this._keys.length; key < nKeys; key++) {
            if (ret < this._keys[key].frame) {
                ret = this._keys[key].frame;
            }
        }
        return ret;
    }

    /**
     * Gets the easing function of the animation
     * @returns Easing function of the animation
     */
    public getEasingFunction(): Nullable<IEasingFunction> {
        return this._easingFunction;
    }

    /**
     * Sets the easing function of the animation
     * @param easingFunction A custom mathematical formula for animation
     */
    public setEasingFunction(easingFunction: Nullable<IEasingFunction>): void {
        this._easingFunction = easingFunction;
    }

    /**
     * Interpolates a scalar linearly
     * @param startValue Start value of the animation curve
     * @param endValue End value of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns Interpolated scalar value
     */
    public floatInterpolateFunction(startValue: number, endValue: number, gradient: number): number {
        return Scalar.Lerp(startValue, endValue, gradient);
    }

    /**
     * Interpolates a scalar cubically
     * @param startValue Start value of the animation curve
     * @param outTangent End tangent of the animation
     * @param endValue End value of the animation curve
     * @param inTangent Start tangent of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns Interpolated scalar value
     */
    public floatInterpolateFunctionWithTangents(startValue: number, outTangent: number, endValue: number, inTangent: number, gradient: number): number {
        return Scalar.Hermite(startValue, outTangent, endValue, inTangent, gradient);
    }

    /**
     * Interpolates a quaternion using a spherical linear interpolation
     * @param startValue Start value of the animation curve
     * @param endValue End value of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns Interpolated quaternion value
     */
    public quaternionInterpolateFunction(startValue: Quaternion, endValue: Quaternion, gradient: number): Quaternion {
        return Quaternion.Slerp(startValue, endValue, gradient);
    }

    /**
     * Interpolates a quaternion cubically
     * @param startValue Start value of the animation curve
     * @param outTangent End tangent of the animation curve
     * @param endValue End value of the animation curve
     * @param inTangent Start tangent of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns Interpolated quaternion value
     */
    public quaternionInterpolateFunctionWithTangents(startValue: Quaternion, outTangent: Quaternion, endValue: Quaternion, inTangent: Quaternion, gradient: number): Quaternion {
        return Quaternion.Hermite(startValue, outTangent, endValue, inTangent, gradient).normalize();
    }

    /**
     * Interpolates a Vector3 linearly
     * @param startValue Start value of the animation curve
     * @param endValue End value of the animation curve
     * @param gradient Scalar amount to interpolate (value between 0 and 1)
     * @returns Interpolated scalar value
     */
    public vector3InterpolateFunction(startValue: Vector3, endValue: Vector3, gradient: number): Vector3 {
        return Vector3.Lerp(startValue, endValue, gradient);
    }

    /**
     * Interpolates a Vector3 cubically
     * @param startValue Start value of the animation curve
     * @param outTangent End tangent of the animation
     * @param endValue End value of the animation curve
     * @param inTangent Start tangent of the animation curve
     * @param gradient Scalar amount to interpolate (value between 0 and 1)
     * @returns InterpolatedVector3 value
     */
    public vector3InterpolateFunctionWithTangents(startValue: Vector3, outTangent: Vector3, endValue: Vector3, inTangent: Vector3, gradient: number): Vector3 {
        return Vector3.Hermite(startValue, outTangent, endValue, inTangent, gradient);
    }

    /**
     * Interpolates a Vector2 linearly
     * @param startValue Start value of the animation curve
     * @param endValue End value of the animation curve
     * @param gradient Scalar amount to interpolate (value between 0 and 1)
     * @returns Interpolated Vector2 value
     */
    public vector2InterpolateFunction(startValue: Vector2, endValue: Vector2, gradient: number): Vector2 {
        return Vector2.Lerp(startValue, endValue, gradient);
    }

    /**
     * Interpolates a Vector2 cubically
     * @param startValue Start value of the animation curve
     * @param outTangent End tangent of the animation
     * @param endValue End value of the animation curve
     * @param inTangent Start tangent of the animation curve
     * @param gradient Scalar amount to interpolate (value between 0 and 1)
     * @returns Interpolated Vector2 value
     */
    public vector2InterpolateFunctionWithTangents(startValue: Vector2, outTangent: Vector2, endValue: Vector2, inTangent: Vector2, gradient: number): Vector2 {
        return Vector2.Hermite(startValue, outTangent, endValue, inTangent, gradient);
    }

    /**
     * Interpolates a size linearly
     * @param startValue Start value of the animation curve
     * @param endValue End value of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns Interpolated Size value
     */
    public sizeInterpolateFunction(startValue: Size, endValue: Size, gradient: number): Size {
        return Size.Lerp(startValue, endValue, gradient);
    }

    /**
     * Interpolates a Color3 linearly
     * @param startValue Start value of the animation curve
     * @param endValue End value of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns Interpolated Color3 value
     */
    public color3InterpolateFunction(startValue: Color3, endValue: Color3, gradient: number): Color3 {
        return Color3.Lerp(startValue, endValue, gradient);
    }

    /**
     * Interpolates a Color3 cubically
     * @param startValue Start value of the animation curve
     * @param outTangent End tangent of the animation
     * @param endValue End value of the animation curve
     * @param inTangent Start tangent of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns interpolated value
     */
    public color3InterpolateFunctionWithTangents(startValue: Color3, outTangent: Color3, endValue: Color3, inTangent: Color3, gradient: number): Color3 {
        return Color3.Hermite(startValue, outTangent, endValue, inTangent, gradient);
    }

    /**
     * Interpolates a Color4 linearly
     * @param startValue Start value of the animation curve
     * @param endValue End value of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns Interpolated Color3 value
     */
    public color4InterpolateFunction(startValue: Color4, endValue: Color4, gradient: number): Color4 {
        return Color4.Lerp(startValue, endValue, gradient);
    }

    /**
     * Interpolates a Color4 cubically
     * @param startValue Start value of the animation curve
     * @param outTangent End tangent of the animation
     * @param endValue End value of the animation curve
     * @param inTangent Start tangent of the animation curve
     * @param gradient Scalar amount to interpolate
     * @returns interpolated value
     */
    public color4InterpolateFunctionWithTangents(startValue: Color4, outTangent: Color4, endValue: Color4, inTangent: Color4, gradient: number): Color4 {
        return Color4.Hermite(startValue, outTangent, endValue, inTangent, gradient);
    }

    /**
     * @internal Internal use only
     */
    public _getKeyValue(value: any): any {
        if (typeof value === "function") {
            return value();
        }

        return value;
    }

    /**
     * Evaluate the animation value at a given frame
     * @param currentFrame defines the frame where we want to evaluate the animation
     * @returns the animation value
     */
    public evaluate(currentFrame: number) {
        return this._interpolate(currentFrame, {
            key: 0,
            repeatCount: 0,
            loopMode: Animation.ANIMATIONLOOPMODE_CONSTANT,
        });
    }

    /**
     * @internal Internal use only
     */
    public _interpolate(currentFrame: number, state: _IAnimationState): any {
        if (state.loopMode === Animation.ANIMATIONLOOPMODE_CONSTANT && state.repeatCount > 0) {
            return state.highLimitValue.clone ? state.highLimitValue.clone() : state.highLimitValue;
        }

        const keys = this._keys;
        const keysLength = keys.length;

        let key = state.key;

        while (key >= 0 && currentFrame < keys[key].frame) {
            --key;
        }

        while (key + 1 <= keysLength - 1 && currentFrame >= keys[key + 1].frame) {
            ++key;
        }

        state.key = key;

        if (key < 0) {
            return this._getKeyValue(keys[0].value);
        } else if (key + 1 > keysLength - 1) {
            return this._getKeyValue(keys[keysLength - 1].value);
        }

        const startKey = keys[key];
        const endKey = keys[key + 1];
        const startValue = this._getKeyValue(startKey.value);
        const endValue = this._getKeyValue(endKey.value);
        if (startKey.interpolation === AnimationKeyInterpolation.STEP) {
            if (endKey.frame > currentFrame) {
                return startValue;
            } else {
                return endValue;
            }
        }

        const useTangent = startKey.outTangent !== undefined && endKey.inTangent !== undefined;
        const frameDelta = endKey.frame - startKey.frame;

        // gradient : percent of currentFrame between the frame inf and the frame sup
        let gradient = (currentFrame - startKey.frame) / frameDelta;

        // check for easingFunction and correction of gradient
        const easingFunction = this.getEasingFunction();
        if (easingFunction !== null) {
            gradient = easingFunction.ease(gradient);
        }

        switch (this.dataType) {
            // Float
            case Animation.ANIMATIONTYPE_FLOAT: {
                const floatValue = useTangent
                    ? this.floatInterpolateFunctionWithTangents(startValue, startKey.outTangent * frameDelta, endValue, endKey.inTangent * frameDelta, gradient)
                    : this.floatInterpolateFunction(startValue, endValue, gradient);
                switch (state.loopMode) {
                    case Animation.ANIMATIONLOOPMODE_CYCLE:
                    case Animation.ANIMATIONLOOPMODE_CONSTANT:
                    case Animation.ANIMATIONLOOPMODE_YOYO:
                        return floatValue;
                    case Animation.ANIMATIONLOOPMODE_RELATIVE:
                        return state.offsetValue * state.repeatCount + floatValue;
                }
                break;
            }
            // Quaternion
            case Animation.ANIMATIONTYPE_QUATERNION: {
                const quatValue = useTangent
                    ? this.quaternionInterpolateFunctionWithTangents(startValue, startKey.outTangent.scale(frameDelta), endValue, endKey.inTangent.scale(frameDelta), gradient)
                    : this.quaternionInterpolateFunction(startValue, endValue, gradient);
                switch (state.loopMode) {
                    case Animation.ANIMATIONLOOPMODE_CYCLE:
                    case Animation.ANIMATIONLOOPMODE_CONSTANT:
                    case Animation.ANIMATIONLOOPMODE_YOYO:
                        return quatValue;
                    case Animation.ANIMATIONLOOPMODE_RELATIVE:
                        return quatValue.addInPlace(state.offsetValue.scale(state.repeatCount));
                }

                return quatValue;
            }
            // Vector3
            case Animation.ANIMATIONTYPE_VECTOR3: {
                const vec3Value = useTangent
                    ? this.vector3InterpolateFunctionWithTangents(startValue, startKey.outTangent.scale(frameDelta), endValue, endKey.inTangent.scale(frameDelta), gradient)
                    : this.vector3InterpolateFunction(startValue, endValue, gradient);
                switch (state.loopMode) {
                    case Animation.ANIMATIONLOOPMODE_CYCLE:
                    case Animation.ANIMATIONLOOPMODE_CONSTANT:
                    case Animation.ANIMATIONLOOPMODE_YOYO:
                        return vec3Value;
                    case Animation.ANIMATIONLOOPMODE_RELATIVE:
                        return vec3Value.add(state.offsetValue.scale(state.repeatCount));
                }
                break;
            }
            // Vector2
            case Animation.ANIMATIONTYPE_VECTOR2: {
                const vec2Value = useTangent
                    ? this.vector2InterpolateFunctionWithTangents(startValue, startKey.outTangent.scale(frameDelta), endValue, endKey.inTangent.scale(frameDelta), gradient)
                    : this.vector2InterpolateFunction(startValue, endValue, gradient);
                switch (state.loopMode) {
                    case Animation.ANIMATIONLOOPMODE_CYCLE:
                    case Animation.ANIMATIONLOOPMODE_CONSTANT:
                    case Animation.ANIMATIONLOOPMODE_YOYO:
                        return vec2Value;
                    case Animation.ANIMATIONLOOPMODE_RELATIVE:
                        return vec2Value.add(state.offsetValue.scale(state.repeatCount));
                }
                break;
            }
            // Size
            case Animation.ANIMATIONTYPE_SIZE: {
                switch (state.loopMode) {
                    case Animation.ANIMATIONLOOPMODE_CYCLE:
                    case Animation.ANIMATIONLOOPMODE_CONSTANT:
                    case Animation.ANIMATIONLOOPMODE_YOYO:
                        return this.sizeInterpolateFunction(startValue, endValue, gradient);
                    case Animation.ANIMATIONLOOPMODE_RELATIVE:
                        return this.sizeInterpolateFunction(startValue, endValue, gradient).add(state.offsetValue.scale(state.repeatCount));
                }
                break;
            }
            // Color3
            case Animation.ANIMATIONTYPE_COLOR3: {
                const color3Value = useTangent
                    ? this.color3InterpolateFunctionWithTangents(startValue, startKey.outTangent.scale(frameDelta), endValue, endKey.inTangent.scale(frameDelta), gradient)
                    : this.color3InterpolateFunction(startValue, endValue, gradient);
                switch (state.loopMode) {
                    case Animation.ANIMATIONLOOPMODE_CYCLE:
                    case Animation.ANIMATIONLOOPMODE_CONSTANT:
                    case Animation.ANIMATIONLOOPMODE_YOYO:
                        return color3Value;
                    case Animation.ANIMATIONLOOPMODE_RELATIVE:
                        return color3Value.add(state.offsetValue.scale(state.repeatCount));
                }
                break;
            }
            // Color4
            case Animation.ANIMATIONTYPE_COLOR4: {
                const color4Value = useTangent
                    ? this.color4InterpolateFunctionWithTangents(startValue, startKey.outTangent.scale(frameDelta), endValue, endKey.inTangent.scale(frameDelta), gradient)
                    : this.color4InterpolateFunction(startValue, endValue, gradient);
                switch (state.loopMode) {
                    case Animation.ANIMATIONLOOPMODE_CYCLE:
                    case Animation.ANIMATIONLOOPMODE_CONSTANT:
                    case Animation.ANIMATIONLOOPMODE_YOYO:
                        return color4Value;
                    case Animation.ANIMATIONLOOPMODE_RELATIVE:
                        return color4Value.add(state.offsetValue.scale(state.repeatCount));
                }
                break;
            }
            // Matrix
            case Animation.ANIMATIONTYPE_MATRIX: {
                switch (state.loopMode) {
                    case Animation.ANIMATIONLOOPMODE_CYCLE:
                    case Animation.ANIMATIONLOOPMODE_CONSTANT:
                    case Animation.ANIMATIONLOOPMODE_YOYO: {
                        if (Animation.AllowMatricesInterpolation) {
                            return this.matrixInterpolateFunction(startValue, endValue, gradient, state.workValue);
                        }
                        return startValue;
                    }
                    case Animation.ANIMATIONLOOPMODE_RELATIVE: {
                        return startValue;
                    }
                }
                break;
            }
        }

        return 0;
    }

    /**
     * Defines the function to use to interpolate matrices
     * @param startValue defines the start matrix
     * @param endValue defines the end matrix
     * @param gradient defines the gradient between both matrices
     * @param result defines an optional target matrix where to store the interpolation
     * @returns the interpolated matrix
     */
    public matrixInterpolateFunction(startValue: Matrix, endValue: Matrix, gradient: number, result?: Matrix): Matrix {
        if (Animation.AllowMatrixDecomposeForInterpolation) {
            if (result) {
                Matrix.DecomposeLerpToRef(startValue, endValue, gradient, result);
                return result;
            }
            return Matrix.DecomposeLerp(startValue, endValue, gradient);
        }

        if (result) {
            Matrix.LerpToRef(startValue, endValue, gradient, result);
            return result;
        }
        return Matrix.Lerp(startValue, endValue, gradient);
    }

    /**
     * Makes a copy of the animation
     * @returns Cloned animation
     */
    public clone(): Animation {
        const clone = new Animation(this.name, this.targetPropertyPath.join("."), this.framePerSecond, this.dataType, this.loopMode);

        clone.enableBlending = this.enableBlending;
        clone.blendingSpeed = this.blendingSpeed;

        if (this._keys) {
            clone.setKeys(this._keys);
        }

        if (this._ranges) {
            clone._ranges = {};
            for (const name in this._ranges) {
                const range = this._ranges[name];
                if (!range) {
                    continue;
                }
                clone._ranges[name] = range.clone();
            }
        }

        return clone;
    }

    /**
     * Sets the key frames of the animation
     * @param values The animation key frames to set
     */
    public setKeys(values: Array<IAnimationKey>): void {
        this._keys = values.slice(0);
    }

    /**
     * Serializes the animation to an object
     * @returns Serialized object
     */
    public serialize(): any {
        const serializationObject: any = {};

        serializationObject.name = this.name;
        serializationObject.property = this.targetProperty;
        serializationObject.framePerSecond = this.framePerSecond;
        serializationObject.dataType = this.dataType;
        serializationObject.loopBehavior = this.loopMode;
        serializationObject.enableBlending = this.enableBlending;
        serializationObject.blendingSpeed = this.blendingSpeed;

        const dataType = this.dataType;
        serializationObject.keys = [];
        const keys = this.getKeys();
        for (let index = 0; index < keys.length; index++) {
            const animationKey = keys[index];

            const key: any = {};
            key.frame = animationKey.frame;

            switch (dataType) {
                case Animation.ANIMATIONTYPE_FLOAT:
                    key.values = [animationKey.value];
                    if (animationKey.inTangent !== undefined) {
                        key.values.push(animationKey.inTangent);
                    }
                    if (animationKey.outTangent !== undefined) {
                        if (animationKey.inTangent === undefined) {
                            key.values.push(undefined);
                        }
                        key.values.push(animationKey.outTangent);
                    }
                    if (animationKey.interpolation !== undefined) {
                        if (animationKey.inTangent === undefined) {
                            key.values.push(undefined);
                        }
                        if (animationKey.outTangent === undefined) {
                            key.values.push(undefined);
                        }
                        key.values.push(animationKey.interpolation);
                    }
                    break;
                case Animation.ANIMATIONTYPE_QUATERNION:
                case Animation.ANIMATIONTYPE_MATRIX:
                case Animation.ANIMATIONTYPE_VECTOR3:
                case Animation.ANIMATIONTYPE_COLOR3:
                case Animation.ANIMATIONTYPE_COLOR4:
                    key.values = animationKey.value.asArray();
                    if (animationKey.inTangent != undefined) {
                        key.values.push(animationKey.inTangent.asArray());
                    }
                    if (animationKey.outTangent != undefined) {
                        if (animationKey.inTangent === undefined) {
                            key.values.push(undefined);
                        }
                        key.values.push(animationKey.outTangent.asArray());
                    }
                    if (animationKey.interpolation !== undefined) {
                        if (animationKey.inTangent === undefined) {
                            key.values.push(undefined);
                        }
                        if (animationKey.outTangent === undefined) {
                            key.values.push(undefined);
                        }
                        key.values.push(animationKey.interpolation);
                    }
                    break;
            }

            serializationObject.keys.push(key);
        }

        serializationObject.ranges = [];
        for (const name in this._ranges) {
            const source = this._ranges[name];

            if (!source) {
                continue;
            }
            const range: any = {};
            range.name = name;
            range.from = source.from;
            range.to = source.to;
            serializationObject.ranges.push(range);
        }

        return serializationObject;
    }

    // Statics
    /**
     * Float animation type
     */
    public static readonly ANIMATIONTYPE_FLOAT = 0;
    /**
     * Vector3 animation type
     */
    public static readonly ANIMATIONTYPE_VECTOR3 = 1;
    /**
     * Quaternion animation type
     */
    public static readonly ANIMATIONTYPE_QUATERNION = 2;
    /**
     * Matrix animation type
     */
    public static readonly ANIMATIONTYPE_MATRIX = 3;
    /**
     * Color3 animation type
     */
    public static readonly ANIMATIONTYPE_COLOR3 = 4;
    /**
     * Color3 animation type
     */
    public static readonly ANIMATIONTYPE_COLOR4 = 7;
    /**
     * Vector2 animation type
     */
    public static readonly ANIMATIONTYPE_VECTOR2 = 5;
    /**
     * Size animation type
     */
    public static readonly ANIMATIONTYPE_SIZE = 6;
    /**
     * Relative Loop Mode
     */
    public static readonly ANIMATIONLOOPMODE_RELATIVE = 0;
    /**
     * Cycle Loop Mode
     */
    public static readonly ANIMATIONLOOPMODE_CYCLE = 1;
    /**
     * Constant Loop Mode
     */
    public static readonly ANIMATIONLOOPMODE_CONSTANT = 2;
    /**
     * Yoyo Loop Mode
     */
    public static readonly ANIMATIONLOOPMODE_YOYO = 4;

    /**
     * @internal
     */
    public static _UniversalLerp(left: any, right: any, amount: number): any {
        const constructor = left.constructor;
        if (constructor.Lerp) {
            // Lerp supported
            return constructor.Lerp(left, right, amount);
        } else if (constructor.Slerp) {
            // Slerp supported
            return constructor.Slerp(left, right, amount);
        } else if (left.toFixed) {
            // Number
            return left * (1.0 - amount) + amount * right;
        } else {
            // Blending not supported
            return right;
        }
    }

    /**
     * Parses an animation object and creates an animation
     * @param parsedAnimation Parsed animation object
     * @returns Animation object
     */
    public static Parse(parsedAnimation: any): Animation {
        const animation = new Animation(parsedAnimation.name, parsedAnimation.property, parsedAnimation.framePerSecond, parsedAnimation.dataType, parsedAnimation.loopBehavior);

        const dataType = parsedAnimation.dataType;
        const keys: Array<IAnimationKey> = [];
        let data;
        let index: number;

        if (parsedAnimation.enableBlending) {
            animation.enableBlending = parsedAnimation.enableBlending;
        }

        if (parsedAnimation.blendingSpeed) {
            animation.blendingSpeed = parsedAnimation.blendingSpeed;
        }

        for (index = 0; index < parsedAnimation.keys.length; index++) {
            const key = parsedAnimation.keys[index];
            let inTangent: any = undefined;
            let outTangent: any = undefined;
            let interpolation: any = undefined;

            switch (dataType) {
                case Animation.ANIMATIONTYPE_FLOAT:
                    data = key.values[0];
                    if (key.values.length >= 2) {
                        inTangent = key.values[1];
                    }
                    if (key.values.length >= 3) {
                        outTangent = key.values[2];
                    }
                    if (key.values.length >= 4) {
                        interpolation = key.values[3];
                    }
                    break;
                case Animation.ANIMATIONTYPE_QUATERNION:
                    data = Quaternion.FromArray(key.values);
                    if (key.values.length >= 8) {
                        const _inTangent = Quaternion.FromArray(key.values.slice(4, 8));
                        if (!_inTangent.equals(Quaternion.Zero())) {
                            inTangent = _inTangent;
                        }
                    }
                    if (key.values.length >= 12) {
                        const _outTangent = Quaternion.FromArray(key.values.slice(8, 12));
                        if (!_outTangent.equals(Quaternion.Zero())) {
                            outTangent = _outTangent;
                        }
                    }
                    if (key.values.length >= 13) {
                        interpolation = key.values[12];
                    }
                    break;
                case Animation.ANIMATIONTYPE_MATRIX:
                    data = Matrix.FromArray(key.values);
                    if (key.values.length >= 17) {
                        interpolation = key.values[16];
                    }
                    break;
                case Animation.ANIMATIONTYPE_COLOR3:
                    data = Color3.FromArray(key.values);
                    if (key.values[3]) {
                        inTangent = Color3.FromArray(key.values[3]);
                    }
                    if (key.values[4]) {
                        outTangent = Color3.FromArray(key.values[4]);
                    }
                    if (key.values[5]) {
                        interpolation = key.values[5];
                    }
                    break;
                case Animation.ANIMATIONTYPE_COLOR4:
                    data = Color4.FromArray(key.values);
                    if (key.values[4]) {
                        inTangent = Color4.FromArray(key.values[4]);
                    }
                    if (key.values[5]) {
                        outTangent = Color4.FromArray(key.values[5]);
                    }
                    if (key.values[6]) {
                        interpolation = Color4.FromArray(key.values[6]);
                    }
                    break;
                case Animation.ANIMATIONTYPE_VECTOR3:
                default:
                    data = Vector3.FromArray(key.values);
                    if (key.values[3]) {
                        inTangent = Vector3.FromArray(key.values[3]);
                    }
                    if (key.values[4]) {
                        outTangent = Vector3.FromArray(key.values[4]);
                    }
                    if (key.values[5]) {
                        interpolation = key.values[5];
                    }
                    break;
            }

            const keyData: any = {};
            keyData.frame = key.frame;
            keyData.value = data;

            if (inTangent != undefined) {
                keyData.inTangent = inTangent;
            }
            if (outTangent != undefined) {
                keyData.outTangent = outTangent;
            }
            if (interpolation != undefined) {
                keyData.interpolation = interpolation;
            }
            keys.push(keyData);
        }

        animation.setKeys(keys);

        if (parsedAnimation.ranges) {
            for (index = 0; index < parsedAnimation.ranges.length; index++) {
                data = parsedAnimation.ranges[index];
                animation.createRange(data.name, data.from, data.to);
            }
        }

        return animation;
    }

    /**
     * Appends the serialized animations from the source animations
     * @param source Source containing the animations
     * @param destination Target to store the animations
     */
    public static AppendSerializedAnimations(source: IAnimatable, destination: any): void {
        SerializationHelper.AppendSerializedAnimations(source, destination);
    }

    /**
     * Creates a new animation or an array of animations from a snippet saved in a remote file
     * @param name defines the name of the animation to create (can be null or empty to use the one from the json data)
     * @param url defines the url to load from
     * @returns a promise that will resolve to the new animation or an array of animations
     */
    public static ParseFromFileAsync(name: Nullable<string>, url: string): Promise<Animation | Array<Animation>> {
        return new Promise((resolve, reject) => {
            const request = new WebRequest();
            request.addEventListener("readystatechange", () => {
                if (request.readyState == 4) {
                    if (request.status == 200) {
                        let serializationObject = JSON.parse(request.responseText);
                        if (serializationObject.animations) {
                            serializationObject = serializationObject.animations;
                        }

                        if (serializationObject.length) {
                            const output = new Array<Animation>();
                            for (const serializedAnimation of serializationObject) {
                                output.push(this.Parse(serializedAnimation));
                            }

                            resolve(output);
                        } else {
                            const output = this.Parse(serializationObject);

                            if (name) {
                                output.name = name;
                            }

                            resolve(output);
                        }
                    } else {
                        reject("Unable to load the animation");
                    }
                }
            });

            request.open("GET", url);
            request.send();
        });
    }

    /**
     * Creates an animation or an array of animations from a snippet saved by the Inspector
     * @param snippetId defines the snippet to load
     * @returns a promise that will resolve to the new animation or a new array of animations
     */
    public static ParseFromSnippetAsync(snippetId: string): Promise<Animation | Array<Animation>> {
        return new Promise((resolve, reject) => {
            const request = new WebRequest();
            request.addEventListener("readystatechange", () => {
                if (request.readyState == 4) {
                    if (request.status == 200) {
                        const snippet = JSON.parse(JSON.parse(request.responseText).jsonPayload);

                        if (snippet.animations) {
                            const serializationObject = JSON.parse(snippet.animations);
                            const outputs = new Array<Animation>();
                            for (const serializedAnimation of serializationObject.animations) {
                                const output = this.Parse(serializedAnimation);
                                output.snippetId = snippetId;
                                outputs.push(output);
                            }

                            resolve(outputs);
                        } else {
                            const serializationObject = JSON.parse(snippet.animation);
                            const output = this.Parse(serializationObject);

                            output.snippetId = snippetId;

                            resolve(output);
                        }
                    } else {
                        reject("Unable to load the snippet " + snippetId);
                    }
                }
            });

            request.open("GET", this.SnippetUrl + "/" + snippetId.replace(/#/g, "/"));
            request.send();
        });
    }

    /**
     * Creates an animation or an array of animations from a snippet saved by the Inspector
     * @deprecated Please use ParseFromSnippetAsync instead
     * @param snippetId defines the snippet to load
     * @returns a promise that will resolve to the new animation or a new array of animations
     */
    public static CreateFromSnippetAsync = Animation.ParseFromSnippetAsync;
}

RegisterClass("BABYLON.Animation", Animation);
Node._AnimationRangeFactory = (name: string, from: number, to: number) => new AnimationRange(name, from, to);
