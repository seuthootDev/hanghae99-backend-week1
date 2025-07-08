import { Module } from "@nestjs/common";
import { PointController } from "./controller/point.controller";
import { PointService } from "./service/point.service";
import { DatabaseModule } from "src/database/database.module";
import { PointRepository } from "./repository/point.repository";

@Module({
    imports: [DatabaseModule],
    controllers: [PointController],
    providers: [
        PointService,
        PointRepository,
    ],
})
export class PointModule {}