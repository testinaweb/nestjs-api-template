import { Column, Entity } from 'typeorm';
import { UlidEntity } from './base.entity.js';

/** Example resource proving the entity/DTO/service/controller layering. */
@Entity('tasks')
export class TaskEntity extends UlidEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'boolean', default: false })
  done!: boolean;
}
