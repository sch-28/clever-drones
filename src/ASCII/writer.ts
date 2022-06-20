import { Vector } from "matter-js";
import * as tf from "@tensorflow/tfjs";
import { convert_ascii } from "./converter";
import { Neural_Network } from "../Drone/neural_network";
import { Drone } from "../Drone/drone";
import { calculate_distance } from "../util";
import { Mat } from "../Matter/matter";

export class Writer {
    // current displayed word
    _word!: String;
    // canvas used for the drones
    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;

    // space taken by each individual pixel
    pixel_size: number = 30;

    // all currently used drones
    drones: Drone[] = [];

    // all destroyed drones that are not yet disposed
    destroyed_drones: Drone[] = []

    // drone that follows the pointer
    mouse_drone!: Drone;

    // input field used for changing the text
    input_field!: HTMLInputElement;

    // timer that is used to wait for a certain time before updating the current word
    input_timer!: NodeJS.Timeout;

    // drone brain that is used to create each drone. Pretrained & Loaded
    drone_brain!: Neural_Network;

    circle_timer: number = 0;

    element_1 = document.getElementById("element-1") as HTMLElement;
    element_2 = document.getElementById("element-2") as HTMLElement;;



    _hover_progress: number = 0;
    hover_field = document.getElementById("hover-progress") as HTMLElement;
    hover_position!: Vector


    constructor(canvas: HTMLCanvasElement, starting_word: String) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;

        this.hover_position = Vector.create(canvas.width / 2, canvas.height / 2 + 132);

        // allows document scrolling above canvas
        this.canvas.onwheel = () => { };


        this.input_field = document.getElementById("input-field") as HTMLInputElement;

        this.input_field.onchange = this.input_change.bind(this);
        this.input_field.onkeyup = this.input_change.bind(this);
        this.input_field.onpaste = this.input_change.bind(this);

        // load pretrained drone and set the starting word afterwards
        this.load_drone_brain().then((brain) => {
            this.drone_brain = brain;
            // this.set_word(starting_word);
            // bind document scroll event for dynamic words
            document.onscroll = this.scroll.bind(this);
            this.scroll();
            this.init_mouse_drone();
        });
    }

    /**
     * @returns pretrained drone neural network
     */
    async load_drone_brain() {
        const model = (await tf.loadLayersModel("/Drone/res/trained_drone/drone.json")) as tf.Sequential;
        const brain = new Neural_Network(model);
        return brain;
    }

    scroll() {
        if (this.scroll_percentage >= 0.9) {
            this.set_word("try it");
            this.element_1.style.display = "none";
            this.element_2.style.display = "flex";
        } else if (this.scroll_percentage <= 0.1) {
            this.set_word("Drones");
            this.element_2.style.display = "none";
            this.element_1.style.display = "flex";
        }
        else {
            // this._word = "";
            this.set_word("Ö")
            this.element_2.style.display = "none";
            this.element_1.style.display = "none";
        }
    }

    get scroll_percentage() {
        if (!document.scrollingElement) return 1;
        return document.scrollingElement.scrollTop / document.scrollingElement.clientHeight;
    }

    /**
     * Updates every drone
     */
    async update() {
        if (this.word == "") {

            for (let i = 0; i < this.drones.length; i++) {
                this.drones[i].set_target(this.get_circle_postion(i, this.circle_timer));
            }
            this.circle_timer += 0.01;
        }



        await this.mouse_drone.update();
        const distance = (calculate_distance(this.mouse_drone.body.position, this.hover_position));
        if (distance <= 20) {
            this.hover_progress++

            if (this.hover_progress == 100) {
                window.location.href = "/Drone/trainer.html"
            }
        } else {
            this.hover_progress = 0;
        }


        if (this.mouse_drone.is_destroyed) {
            this.mouse_drone.destroy();
            this.destroyed_drones.push(this.mouse_drone);
            this.init_mouse_drone();
        }
        // filter out all disposed drones
        this.destroyed_drones = this.destroyed_drones.filter(d => !d.is_disposed);

        // destroy drone if it hits a boundary
        const to_be_removed: number[] = [];
        for (let i = 0; i < this.drones.length; i++) {
            const drone = this.drones[i];
            await drone.update();
            if (drone.is_destroyed) {
                to_be_removed.push(drone.brain.model.id);
            }
        }

        this.drones = this.drones.filter((drone) => {
            if (to_be_removed.includes(drone.brain.model.id)) {
                drone.destroy();
                this.destroyed_drones.push(drone);
                return false;
            }
            return true;
        });
    }

    get_circle_postion(index: number, i: number) {
        // const x = index * 3 * Math.cos(i + index) + Math.floor(this.canvas.width / 2);
        // const y = index * 2 * Math.sin(i + index) + Math.floor(this.canvas.height / 2);
        const x = Math.floor(index % 15) * 50 + Math.floor(this.canvas.width / 2);
        const y = Math.floor(index / 15) * 50 + Math.floor(this.canvas.height / 2);
        return Vector.create(x, y);
    }

    /**
     * Draws every drone
     */
    draw() {
        this.mouse_drone.draw();
        this.drones.forEach((drone) => {
            drone.draw();
        });
        this.destroyed_drones.forEach((drone) => {
            drone.draw();
        })
    }

    init_mouse_drone() {
        this.mouse_drone = new Drone(this.drone_brain.copy());
        this.mouse_drone.set_mouse_mode(true);
    }

    /**
     * Wait for a certain delay before updating the current word.
     * If there is another call while already waiting -> reset timer.
     */
    input_change() {
        clearTimeout(this.input_timer);
        this.input_timer = setTimeout(() => {
            if (this.input_field.value) this.set_word(this.input_field.value);
        }, 500);
    }

    /**
     * Disposes all drones
     */
    dispose_drones() {
        this.drones.forEach((drone) => {
            drone.dispose();
        });
        this.drones = [];
    }

    get word() {
        return this._word;
    }

    /**
     *	Sets the new word and spawns/destroys drones accordingly
     * @param new_word new word to be set
     */
    async set_word(new_word: String) {
        if (this.word == new_word) return;
        this._word = new_word;

        // all pixels that need to be "drawn"
        const positions: Vector[] = [];

        // x- & y-translation to center the word on the canvas
        const x_translation = ((this.canvas.width - 6 * new_word.length * this.pixel_size) + this.pixel_size) / 2;
        const y_translation = this.canvas.height / 2 - 4 * this.pixel_size;

        // calculate every pixel position on the canvas and save it to the positions array
        for (let i = 0; i < new_word.length; i++) {
            const letter = convert_ascii(new_word[i]);
            for (let x = 0; x < 6; x++) {
                for (let y = 0; y < 8; y++) {
                    if (letter[x][y]) {
                        const pos = Vector.create(
                            x * this.pixel_size + i * (6 * this.pixel_size) + x_translation,
                            y * this.pixel_size - this.pixel_size / 2 + y_translation
                        );
                        positions.push(pos);
                    }
                }
            }
        }

        // check if drones need to be added
        // if (positions.length > this.drones.length) {
        //     for (let i = this.drones.length; i < positions.length; i++) {
        //         this.drones.push(new Drone(this.drone_brain.copy()));
        //     }
        //     // check if drones need to be removed
        // } else if (positions.length < this.drones.length) {
        //     for (let i = positions.length; i < this.drones.length; i++) {
        //         this.drones[i].destroy();
        //         this.destroyed_drones.push(this.drones[i]);
        //     }
        //     this.drones.splice(positions.length, this.drones.length - positions.length);
        // }

        const new_drones: Drone[] = [];
        // give each drone the new target (pixel)
        for (let i = 0; i < positions.length; i++) {
            // const drone = this.drones[i];
            const drones = this.drones.filter(d => !new_drones.includes(d));
            const can_spawn = this.drones.length < positions.length;
            let drone = this.get_closest_drone(drones, positions[i], can_spawn);
            if (!drone) {
                drone = new Drone(this.drone_brain.copy())
            }
            new_drones.push(drone);
            drone.set_target(positions[i]);
        }

        for (let i = 0; i < this.drones.length; i++) {
            if (!new_drones.includes(this.drones[i])) {
                this.drones[i].destroy();
                this.destroyed_drones.push(this.drones[i]);
            }
        }
        this.drones = new_drones;

    }

    /**
     * Returns the nearest drone to a given point. Return null if there are no drones present.
     * */
    get_closest_drone(drones: Drone[], position: Vector, can_spawn: Boolean) {
        if (drones.length == 0) return null;

        let closest_drone: Drone | null = null;
        let shortest_distance = Infinity;
        for (let i = 0; i < drones.length; i++) {
            const drone = drones[i];
            const distance = calculate_distance(drone.body.position, position);
            const spawn_distance = calculate_distance(Drone.spawn_point, position);
            if (distance < shortest_distance && !can_spawn || (distance < spawn_distance && distance < shortest_distance && can_spawn)) {
                closest_drone = drone;
                shortest_distance = distance;
            }
        }

        return closest_drone;
    }

    set hover_progress(new_value: number) {
        this._hover_progress = new_value;
        this.hover_field.style.height = `${new_value}%`
    }

    get hover_progress() {
        return this._hover_progress;
    }
}
