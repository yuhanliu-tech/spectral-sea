import { Mat4, mat4, Vec3, vec3 } from "wgpu-matrix";
import { toRadians } from "../math_util";
import { device, canvas, fovYDegrees, aspectRatio } from "../renderer";

class CameraUniforms {
    readonly buffer = new ArrayBuffer(4 * 16 + 4 * 4 + 4 * 4);
    private readonly floatView = new Float32Array(this.buffer);

    set viewProjMat(mat: Float32Array) {
        this.floatView.set(mat);
    }
    
    set cameraPos(pos: Float32Array) {
        this.floatView[16] = pos[0];
        this.floatView[17] = pos[1];
        this.floatView[18] = pos[2];
        this.floatView[19] = 0;
    }

    set cameraLookPos(lookPos: Float32Array) {
        this.floatView[20] = lookPos[0];
        this.floatView[21] = lookPos[1];
        this.floatView[22] = lookPos[2];
        this.floatView[23] = 0;
    }
    // set viewMat(mat: Float32Array) {
    //     this.floatView.set(mat, 16);
    // }

    // set invViewProj(mat: Float32Array) {
    //     this.floatView.set(mat, 16 * 2);
    // }

    // set xScale(n: number) {
    //     this.floatView[16 * 3] = n;
    // }

    // set yScale(n: number) {
    //     this.floatView[16 * 3 + 1] = n;
    // }

    // set near(n: number) {
    //     this.floatView[16 * 3 + 2] = n;
    // }

    // set logfarovernear(n: number) {
    //     this.floatView[16 * 3 + 3] = n;
    // }

    
}

export class Camera {
    uniforms: CameraUniforms = new CameraUniforms();
    uniformsBuffer: GPUBuffer;

    private _cameraPos: [number, number, number] = [-7, 2, 0];

    projMat: Mat4 = mat4.create();
    //cameraPos: Vec3 = vec3.create(-7, 2, 0);
    cameraFront: Vec3 = vec3.create(0, 0, -1);
    cameraUp: Vec3 = vec3.create(0, 1, 0);
    cameraRight: Vec3 = vec3.create(1, 0, 0);
    yaw: number = 0;
    pitch: number = 0;
    moveSpeed: number = 0.03;
    sensitivity: number = 0.15;

    static readonly nearPlane = 0.1;
    static readonly farPlane = 1000;

    keys: { [key: string]: boolean } = {};

    get cameraPos() {
        return this._cameraPos;
    }

    set cameraPos(newPos: [number, number, number]) {
        this._cameraPos[0] = newPos[0];
        this._cameraPos[1] = newPos[1];
        this._cameraPos[2] = newPos[2];
    }

    constructor() {
        this.uniformsBuffer = device.createBuffer({
            label: "uniforms",
            size: this.uniforms.buffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.projMat = mat4.perspective(toRadians(fovYDegrees), aspectRatio, Camera.nearPlane, Camera.farPlane);

        this.rotateCamera(0, 0); // set initial camera vectors

        window.addEventListener('keydown', (event) => this.onKeyEvent(event, true));
        window.addEventListener('keyup', (event) => this.onKeyEvent(event, false));
        window.onblur = () => this.keys = {}; // reset keys on page exit so they don't get stuck (e.g. on alt + tab)

        canvas.addEventListener('mousedown', () => canvas.requestPointerLock());
        canvas.addEventListener('mouseup', () => document.exitPointerLock());
        canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
    }

    private onKeyEvent(event: KeyboardEvent, down: boolean) {
        this.keys[event.key.toLowerCase()] = down;
        if (this.keys['alt']) { // prevent issues from alt shortcuts
            event.preventDefault();
        }
    }

    private rotateCamera(dx: number, dy: number) {
        this.yaw += dx;
        this.pitch -= dy;

        if (this.pitch > 89) {
            this.pitch = 89;
        }
        if (this.pitch < -89) {
            this.pitch = -89;
        }

        const front = mat4.create();
        front[0] = Math.cos(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));
        front[1] = Math.sin(toRadians(this.pitch));
        front[2] = Math.sin(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));

        this.cameraFront = vec3.normalize(front);
        this.cameraRight = vec3.normalize(vec3.cross(this.cameraFront, [0, 1, 0]));
        this.cameraUp = vec3.normalize(vec3.cross(this.cameraRight, this.cameraFront));
    }

    private onMouseMove(event: MouseEvent) {
        if (document.pointerLockElement === canvas) {
            this.rotateCamera(event.movementX * this.sensitivity, event.movementY * this.sensitivity);
        }
    }

    private processInput(deltaTime: number) {
        let moveDir = vec3.create(0, 0, 0);
        if (this.keys['w']) {
            moveDir = vec3.add(moveDir, this.cameraFront);
        }
        if (this.keys['s']) {
            moveDir = vec3.sub(moveDir, this.cameraFront);
        }
        if (this.keys['a']) {
            moveDir = vec3.sub(moveDir, this.cameraRight);
        }
        if (this.keys['d']) {
            moveDir = vec3.add(moveDir, this.cameraRight);
        }
        if (this.keys['q']) {
            moveDir = vec3.sub(moveDir, this.cameraUp);
        }
        if (this.keys['e']) {
            moveDir = vec3.add(moveDir, this.cameraUp);
        }

        let moveSpeed = this.moveSpeed * deltaTime;
        const moveSpeedMultiplier = 10;
        if (this.keys['shift']) {
            moveSpeed *= moveSpeedMultiplier;
        }
        if (this.keys['alt']) {
            moveSpeed /= moveSpeedMultiplier;
        }

        if (vec3.length(moveDir) > 0) {
            const moveAmount = vec3.scale(vec3.normalize(moveDir), moveSpeed);
            this.cameraPos = vec3.add(this.cameraPos, moveAmount);
        }
    }

    onFrame(deltaTime: number) {
        this.processInput(deltaTime);
        
        
        const lookPos = vec3.add(this.cameraPos, vec3.scale(this.cameraFront, 1));
        this.uniforms.cameraLookPos = lookPos;

        
        const viewProjMat = mat4.mul(this.projMat, mat4.lookAt(this.cameraPos, lookPos, [0, 1, 0]));
        this.uniforms.viewProjMat = viewProjMat;
        
        // const viewMat = mat4.lookAt(this.cameraPos, lookPos, [0, 1, 0]);
        // this.uniforms.viewMat = viewMat;
        
        // const invViewProj = mat4.inverse(viewProjMat);
        // this.uniforms.invViewProj = invViewProj;

        // this.uniforms.xScale = 1 / this.projMat[0];
        // this.uniforms.yScale = 1 / this.projMat[5];
        // this.uniforms.near = Camera.nearPlane;
        // this.uniforms.logfarovernear = Math.log(Camera.farPlane / Camera.nearPlane);
        this.uniforms.cameraPos = vec3.create(this.cameraPos[0], this.cameraPos[1], this.cameraPos[2]);
        device.queue.writeBuffer(this.uniformsBuffer, 0, this.uniforms.buffer);
    }
}
