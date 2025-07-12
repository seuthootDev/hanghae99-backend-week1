import { Body, Controller, Get, Param, Patch, ValidationPipe } from "@nestjs/common";
import { PointHistory } from "../point.model";
import { PointChargeDto, PointUseDto, PointUserDto, PointResponseDto } from "../dto/point.dto";
import { PointService } from "../service/point.service";

@Controller('/point')
export class PointController {

    constructor(
        private readonly pointService: PointService,
    ) {}

    /**
     * TODO - 특정 유저의 포인트를 조회하는 기능을 작성해주세요.
     */
    @Get(':id')
    async point(@Param('id') id: string): Promise<PointResponseDto> {
        const userId = Number.parseInt(id);
        
        // 입력값 검증
        if (isNaN(userId) || userId <= 0) {
            throw new Error('Invalid user ID');
        }
        
        const dto: PointUserDto = { userId };
        return await this.pointService.getUserPoint(dto);
    }

    /**
     * TODO - 특정 유저의 포인트 충전/이용 내역을 조회하는 기능을 작성해주세요.
     */
    @Get(':id/histories')
    async history(@Param('id') id: string): Promise<PointHistory[]> {
        const userId = Number.parseInt(id);
        
        // 입력값 검증
        if (isNaN(userId) || userId <= 0) {
            throw new Error('Invalid user ID');
        }
        
        const dto: PointUserDto = { userId };
        return await this.pointService.getPointHistory(dto);
    }

    /**
     * TODO - 특정 유저의 포인트를 충전하는 기능을 작성해주세요.
     */
    @Patch(':id/charge')
    async charge(
        @Param('id') id: string,
        @Body(ValidationPipe) pointDto: PointChargeDto,
    ): Promise<PointResponseDto> {
        const userId = Number.parseInt(id);
        
        // 입력값 검증
        if (isNaN(userId) || userId <= 0) {
            throw new Error('Invalid user ID');
        }
        
        // DTO에 userId 설정
        pointDto.userId = userId;
        
        return await this.pointService.addPoints(pointDto);
    }

    /**
     * TODO - 특정 유저의 포인트를 사용하는 기능을 작성해주세요.
     */
    @Patch(':id/use')
    async use(
        @Param('id') id: string,
        @Body(ValidationPipe) pointDto: PointUseDto,
    ): Promise<PointResponseDto> {
        const userId = Number.parseInt(id);
        
        // 입력값 검증
        if (isNaN(userId) || userId <= 0) {
            throw new Error('Invalid user ID');
        }
        
        // DTO에 userId 설정
        pointDto.userId = userId;
        
        return await this.pointService.usePoints(pointDto);
    }
}