import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { UserPointTable } from '../../database/userpoint.table';
import { PointHistoryTable } from '../../database/pointhistory.table';
import { UserPoint, PointHistory, TransactionType } from '../point.model';

@Injectable()
export class PointRepository {
  constructor(
    private readonly userDb: UserPointTable,
    private readonly historyDb: PointHistoryTable,
  ) {}

  async getUserPoint(id: number): Promise<UserPoint> {
    try {
      return await this.userDb.selectById(id);
    } catch (error) {
      throw new InternalServerErrorException('Failed to get user point');
    }
  }

  async getHistories(id: number): Promise<PointHistory[]> {
    try {
      return await this.historyDb.selectAllByUserId(id);
    } catch (error) {
      throw new InternalServerErrorException('Failed to get point histories');
    }
  }

  async updatePointWithHistory(
    id: number,
    newPoint: number,
    amount: number,
    type: TransactionType,
  ): Promise<UserPoint> {
    try {
      const updatedPoint = await this.userDb.insertOrUpdate(id, newPoint);
      await this.historyDb.insert(id, amount, type, Date.now());
      return updatedPoint;
    } catch (error) {
      throw new InternalServerErrorException('Failed to update point with history');
    }
  }
} 