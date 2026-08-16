import {
  BeforeInsert,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';

/** Shared base: char(26) ULID PK + created/updated/deleted timestamps. */
export abstract class UlidEntity {
  @PrimaryColumn({ type: 'char', length: 26 })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @BeforeInsert()
  protected assignId(): void {
    if (!this.id) this.id = ulid();
  }
}
