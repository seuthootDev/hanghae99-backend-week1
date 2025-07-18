import { Injectable } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { TransactionType } from '../point.model';
import { PointChargeDto, PointUserDto, PointResponseDto, PointUseDto } from '../dto/point.dto';
import { PointRepository } from '../repository/point.repository';

@Injectable()
export class PointService {
  // 정책 상수
  private readonly MAX_BALANCE = 1000000; // 최대 잔고: 100만 포인트
  private readonly MIN_CHARGE_AMOUNT = 1000; // 최소 충전 금액: 1000 포인트
  private readonly MAX_USER_ID = 1000000000; // 최대 사용자 ID: 10억
  private readonly MAX_POINTS_AMOUNT = 1000000000; // 최대 포인트 값: 10억

  // 사용자별 뮤텍스 관리
  private userLocks = new Map<number, Mutex>();

  constructor(
    private pointRepository: PointRepository,
  ) {}

  private getMutex(userId: number): Mutex {
    if (!this.userLocks.has(userId)) {
      this.userLocks.set(userId, new Mutex());
    }
    return this.userLocks.get(userId)!;
  }

  async addPoints(dto: PointChargeDto): Promise<PointResponseDto> {
    const mutex = this.getMutex(dto.userId);
    
    return await mutex.runExclusive(async () => {
      // 입력값 검증
      this.validateUserId(dto.userId);
      this.validatePointsAmount(dto.amount);
      this.validateChargeAmount(dto.amount);
      
      // 현재 잔고 조회
      const currentUserPoint = await this.pointRepository.getUserPoint(dto.userId);
      const currentBalance = currentUserPoint.point;
      
      // 최대 잔고 검증
      const newBalance = currentBalance + dto.amount;
      this.validateMaxBalance(newBalance);
      
      // 포인트 업데이트 및 내역 저장
      await this.pointRepository.updatePointWithHistory(
        dto.userId,
        newBalance,
        dto.amount,
        TransactionType.CHARGE
      );
      
      return {
        userId: dto.userId,
        currentBalance: newBalance,
        transactionAmount: dto.amount,
        transactionType: 'CHARGE',
        timestamp: Date.now(),
      };
    });
  }

  async getUserPoint(dto: PointUserDto): Promise<PointResponseDto> {
    // 입력값 검증
    this.validateUserId(dto.userId);
    
    // 사용자 포인트 조회
    const userPoint = await this.pointRepository.getUserPoint(dto.userId);
    
    return {
      userId: dto.userId,
      currentBalance: userPoint.point,
      timestamp: Date.now(),
    };
  }

  async usePoints(dto: PointUseDto): Promise<PointResponseDto> {
    const mutex = this.getMutex(dto.userId);
    
    return await mutex.runExclusive(async () => {
      // 입력값 검증
      this.validateUserId(dto.userId);
      this.validatePointsAmount(dto.amount);
      
      // 현재 잔고 조회
      const currentUserPoint = await this.pointRepository.getUserPoint(dto.userId);
      const currentBalance = currentUserPoint.point;
      
      // 잔고 부족 검증
      if (currentBalance < dto.amount) {
        throw new Error('Insufficient balance');
      }
      
      // 포인트 차감
      const newBalance = currentBalance - dto.amount;
      
      // 포인트 업데이트 및 내역 저장
      await this.pointRepository.updatePointWithHistory(
        dto.userId,
        newBalance,
        dto.amount,
        TransactionType.USE
      );
      
      return {
        userId: dto.userId,
        currentBalance: newBalance,
        transactionAmount: dto.amount,
        transactionType: 'USE',
        timestamp: Date.now(),
      };
    });
  }

  async getPointHistory(dto: PointUserDto): Promise<any[]> {
    // 입력값 검증
    this.validateUserId(dto.userId);
    
    // 포인트 내역 조회
    const histories = await this.pointRepository.getHistories(dto.userId);
    
    return histories;
  }

  private validateUserId(userId: number): void {
    if (userId <= 0) {
      throw new Error('Invalid user ID');
    }
    if (userId > this.MAX_USER_ID) {
      throw new Error('User ID is too large');
    }
  }

  private validatePointsAmount(points: number): void {
    if (!Number.isInteger(points)) {
      throw new Error('Points must be integer');
    }
    if (points < 0) {
      throw new Error('Cannot charge negative points');
    }
    if (points > this.MAX_POINTS_AMOUNT) {
      throw new Error('Points amount is too large');
    }
  }

  private validateChargeAmount(points: number): void {
    if (points > 0 && points < this.MIN_CHARGE_AMOUNT) {
      throw new Error('Minimum charge amount is 1000 points');
    }
  }

  private validateMaxBalance(balance: number): void {
    if (balance > this.MAX_BALANCE) {
      throw new Error('Maximum balance exceeded');
    }
  }
}