import Matter, { Bodies, Body, Composite, Vector } from "matter-js";
import { Thruster } from "./thruster";
import { Drone_Inputs, Neural_Network } from "./neural_network";
import { draw_body } from "../util";
import { Mat } from "../Matter/matter";

export class Drone {
    // main_body size
    size: number = 20;
    // thruster power
    thruster_power = 0.0008;
    // max amount of iterations before drone is supposed to reach target
    max_duration: number = 600;
    // thrusters - 2 at the moment
    thrusters: Thruster[] = [];
    brain!: Neural_Network;
    // timer keeping track of current spent iterations
    timer!: number;
    // drone targets
    percentage_targets = [
        Vector.create(0.5, 0.5),
        Vector.create(0.3, 0.6),
        Vector.create(0.5, 0.8),
        Vector.create(0.3, 0.4),
        Vector.create(0.2, 0.8),
        Vector.create(0.5, 0.5),
        Vector.create(0.8, 0.2),
        Vector.create(0.8, 0.8),
        Vector.create(0.2, 0.2),
    ];
    targets: Vector[] = [];
    // current target that the drone is supposed to reach
    current_target = 0;
    mouse_mode: Boolean = false;
    manual_target: Vector | null = null;
    // counter for standing on top of target
    target_arrived!: number;
    target_arrived_total!: number;
    // score evaluated while flying
    score!: number;
    // fitness normalized score after generation is completed
    fitness!: number;
    // when completing or flying against a boundary -> destroy drone
    is_destroyed!: boolean;
    // if the drone is destroyed & the brain is disposed
    is_disposed!: boolean;
    // the body is the cube + thrusters
    body!: Body;
    // main_body is only the center cube
    main_body!: Body;

    static spawn_point: Vector = Vector.create(0, 0);

    constructor(brain: Neural_Network | null = null, position: Vector | null = null) {

        if (!position) position = Drone.spawn_point;
        // create main_body of drone
        this.main_body = Bodies.rectangle(
            position.x,
            position.y,
            this.size,
            this.size
        );
        Body.setAngle(this.main_body, -Math.PI);

        // create 2 thrusters which are left and right to the main body
        this.thrusters.push(new Thruster(this, Vector.create(10, 10), this.thruster_power));
        this.thrusters.push(new Thruster(this, Vector.create(-10, 10), this.thruster_power));

        // create full body out of the thrusters and main_body
        const body_options: Matter.IBodyDefinition = { parts: [this.main_body], collisionFilter: { group: -1 } };
        for (let i = 0; i < this.thrusters.length; i++) {
            const thruster = this.thrusters[i];
            body_options.parts!.push(thruster.body);
        }
        this.body = Body.create(body_options);

        // add body to the matter engine
        Composite.add(Mat.engine.world, this.body);

        // init all variables
        this.score = 0;
        this.fitness = 0;
        this.is_destroyed = false;
        this.timer = 0;
        this.target_arrived = 0;
        this.target_arrived_total = 0;
        if (this.mouse_mode) this.max_duration = 100000;

        this.percentage_targets.forEach((target) => {
            this.targets.push(
                Vector.create(Math.floor(Mat.canvas.width * target.x), Math.floor(Mat.canvas.height * target.y))
            );
        });

        // create a new brain if the drone is not a child
        if (brain) {
            this.brain = brain;
        } else {
            this.brain = new Neural_Network();
        }
    }

    draw() {
        // draws main body
        draw_body(Mat.ctx, this.main_body);
        // draws current_target
        if (!this.is_destroyed && !this.manual_target) {
            Mat.ctx.fillStyle = "red";
            Mat.ctx.fillRect(this.target.x - 5, this.target.y - 5, 10, 10);
        }
        // draws thrusters
        this.thrusters.forEach((thruster) => thruster.draw());
    }

    set_mouse_mode(bool: Boolean) {
        this.mouse_mode = bool;
        this.max_duration = 100000;
    }

    async update() {
        if (this.is_destroyed) return;

        // check if the drone is colliding with the ground
        Mat.boundaries.forEach((boudary) => {
            const is_colliding = Matter.SAT.collides(this.body, boudary.body);
            if (is_colliding) {
                // set drone to destroyed and remove the physic object from the engine for better performance
                this.is_destroyed = true;
                this.target_arrived = 0;
                if (!this.manual_target && !this.mouse_mode)
                    Composite.remove(Mat.engine.world, this.body, true);
            }
        });

        // add score based on the linear distance towards the target
        let distance_score = 1 / (this.get_distance_to_taget()! + 1);
        this.score += Math.pow(distance_score, 1);

        // check if the drone reached the current_target
        if (this.get_distance_to_taget() <= 20 && !this.mouse_mode) {
            this.target_arrived++;
            // if the drone stayed 100 ticks on top of the current_target -> next target
            if (this.target_arrived == 100) {
                // add weighted score based on the time it took to reach the target
                // TODO SPEED WEIGHT
                this.score += (this.max_duration - this.timer) * 0.1 + 200;
                this.current_target++;
                this.target_arrived = 0;
                this.timer = 0;

                // if last target has been reached -> destroy drone
                if (this.current_target == this.targets.length && !this.mouse_mode) {
                    this.current_target = 0;
                    this.is_destroyed = true;
                }
            }
            this.target_arrived_total++;
        } else {
            // reset the target_arrived counter to 0 if the drone leaves it
            this.target_arrived = 0;
        }

        // calculate the next action
        await this.calculate_action();

        // update all thrusters
        for (let i = 0; i < this.thrusters.length; i++) {
            const thruster = this.thrusters[i];
            thruster.update();
        }

        this.timer++;
        // if the drone took too much time to reach the current_target -> destroy it
        if (this.timer == this.max_duration) {
            this.is_destroyed = true;
        }
    }

    /**
     * Calculates the distance to the current_target of the drone
     * @returns the distance to the current_target
     */
    // get_distance_to_taget() {
    // 	return Math.round(calculate_distance(this.target, this.body.position));
    // }

    get_distance_to_taget() {
        const distance = Math.sqrt(
            Math.pow(this.target.y - this.body.position.y, 2) + Math.pow(this.target.x - this.body.position.x, 2)
        );
        return Math.round(distance);
    }

    set_target(position: Vector) {
        this.set_mouse_mode(true);
        this.manual_target = position;
    }

    get target() {
        if (this.manual_target) return this.manual_target;
        if (this.mouse_mode) return Mat.mouse.position;

        return this.targets[this.current_target];
    }

    /**
     * Returns the vector between the drone and the current_target
     */
    get target_vector() {
        return Vector.sub(this.target, this.body.position);
    }

    destroy() {
        this.is_destroyed = true;
        setTimeout(this.dispose.bind(this), 2 * 1000);
    }

    /**
     * Calculates the next action based on the neural network inside the brain
     * Inputs are:
     * - velocity
     * - angular_velocity
     * - angle
     * - target_vector
     * The output will control the angle & thrust of each thruster
     */
    async calculate_action() {
        const inputs: Drone_Inputs = {
            velocity: this.body.velocity,
            angular_velocity: this.body.angularVelocity,
            angle: this.body.angle,
            target_vector: this.target_vector,
        };

        // outputs of brain are between -1 & 1
        const outputs = await this.brain.predict(inputs);

        // using absolute values to convert the thrust output to 0-1
        const left_thrust = Math.abs(outputs[0]);
        const right_thrust = Math.abs(outputs[1]);

        // multiplying the angle output times 2*PI allows the drone to turn the thrusters by 360° in on step
        // TODO might wanna change that
        const left_angle = outputs[2] * 0.5 * Math.PI;
        const right_angle = outputs[3] * 0.5 * Math.PI;

        this.thrusters[0].set_angle(left_angle);
        this.thrusters[1].set_angle(right_angle);

        this.thrusters[0].set_power(left_thrust);
        this.thrusters[1].set_power(right_thrust);
    }

    /**
     * Disposes current drone to prevent memory leak
     */
    dispose() {
        Composite.remove(Mat.engine.world, this.body, true);
        delete this.thrusters[0];
        delete this.thrusters[1];
        this.brain.dispose();
        this.is_disposed = true;
    }

    freeze() {
        Composite.remove(Mat.engine.world, this.body, true);
    }
    unfreeze() {
        Composite.add(Mat.engine.world, this.body);
    }

    /**
     * @returns a copy of the current drone
     */
    copy() {
        const drone_copy = new Drone(this.brain.copy());
        drone_copy.score = this.score;
        return drone_copy;
    }
}
