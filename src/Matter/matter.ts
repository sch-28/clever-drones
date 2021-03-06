import Matter, { Vector } from "matter-js";
import { Drone } from "../Drone/drone";
import { UI } from "../Trainer/ui";
import { random } from "../util";
import { Boundary } from "./boundary";

class Matter_Manager {
    // matter-js engine
    engine!: Matter.Engine;
    // list of all walls
    boundaries!: Boundary[];
    // Mouse tracker for the main canvas
    mouse!: Matter.Mouse;

    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;

    constructor() {
        this.engine = Matter.Engine.create();
    }

    add_boundary(boundary: Boundary) {
        this.boundaries.push(boundary);
    }

    update() {
        Matter.Engine.update(this.engine);
    }
    set_canvas(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.set_mouse(canvas);
        // create walls on the canvas border
        this.boundaries = [
            new Boundary(Mat.canvas.width / 2, Mat.canvas.height + 10, Mat.canvas.width * 4, 20),
            new Boundary(Mat.canvas.width / 2, -10, Mat.canvas.width, 20),
            new Boundary(-10, Mat.canvas.height / 2, 20, Mat.canvas.height),
            new Boundary(Mat.canvas.width + 10, Mat.canvas.height / 2, 20, Mat.canvas.height),
        ];
        Drone.spawn_point = Vector.create(Math.round(Mat.canvas.width / 2), Math.round(Mat.canvas.height) - 400);
    }

    set_mouse(canvas: HTMLCanvasElement) {
        this.mouse = Matter.Mouse.create(canvas);
        // allows document scrolling above canvas
        this.mouse.element.removeEventListener("mousewheel", (this.mouse as any).mousewheel);
        this.mouse.element.removeEventListener("DOMMouseScroll", (this.mouse as any).mousewheel);
    }

    get random_positon() {
        const rando_x = Math.random();
        const rando_y = Math.random();
        let x, y;
        x = rando_x * this.canvas.width;
        y = rando_y * this.canvas.height;

        return Vector.create(x, y);
    }
}

export const Mat = new Matter_Manager();
