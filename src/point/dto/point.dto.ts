import { IsInt, Min, Max, IsOptional } from "class-validator";

// 사용자 ID DTO (조회용)
export class PointUserDto {
    @IsInt()
    @Min(1)
    userId: number;
}

// 포인트 충전 DTO
export class PointChargeDto {
    @IsInt()
    @Min(1)
    userId: number;

    @IsInt()
    @Min(1000) // 최소 충전 금액
    @Max(1000000) // 최대 충전 금액
    amount: number;
}

// 포인트 사용 DTO
export class PointUseDto {
    @IsInt()
    @Min(1)
    userId: number;

    @IsInt()
    @Min(1)
    @Max(1000000) // 최대 사용 금액
    amount: number;
}

// 포인트 응답 DTO
export class PointResponseDto {
    userId: number;
    currentBalance: number;
    transactionAmount?: number;
    transactionType?: 'CHARGE' | 'USE';
    timestamp: number;
}