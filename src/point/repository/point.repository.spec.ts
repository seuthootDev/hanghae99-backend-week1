import { Test, TestingModule } from '@nestjs/testing';
import { PointRepository } from './point.repository';
import { UserPointTable } from '../../database/userpoint.table';
import { PointHistoryTable } from '../../database/pointhistory.table';
import { TransactionType } from '../point.model';

describe('PointRepository', () => {
  let repository: PointRepository;
  let mockUserPointTable: jest.Mocked<UserPointTable>;
  let mockPointHistoryTable: jest.Mocked<PointHistoryTable>;

  beforeEach(async () => {
    const mockUserPointTableProvider = {
      provide: UserPointTable,
      useValue: {
        selectById: jest.fn(),
        insertOrUpdate: jest.fn(),
      },
    };

    const mockPointHistoryTableProvider = {
      provide: PointHistoryTable,
      useValue: {
        selectAllByUserId: jest.fn(),
        insert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointRepository,
        mockUserPointTableProvider,
        mockPointHistoryTableProvider,
      ],
    }).compile();

    repository = module.get<PointRepository>(PointRepository);
    mockUserPointTable = module.get(UserPointTable);
    mockPointHistoryTable = module.get(PointHistoryTable);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getUserPoint', () => {
    describe('정상 케이스', () => {
      it('사용자 포인트를 조회해야 한다', async () => {
        // Given: 사용자 포인트 정보
        const userId = 1;
        const mockUserPoint = {
          id: userId,
          point: 5000,
          updateMillis: Date.now(),
        };
        
        mockUserPointTable.selectById.mockResolvedValue(mockUserPoint);
        
        // When: 포인트 조회
        const result = await repository.getUserPoint(userId);
        
        // Then: 포인트 정보 반환
        expect(result).toEqual(mockUserPoint);
        expect(result.id).toBe(userId);
        expect(result.point).toBe(5000);
        expect(mockUserPointTable.selectById).toHaveBeenCalledWith(userId);
      });
    });

    describe('예외 케이스', () => {
      it('데이터베이스 조회 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 데이터베이스 조회 실패
        const userId = 1;
        
        mockUserPointTable.selectById.mockRejectedValue(
          new Error('Database connection failed')
        );
        
        // When & Then: 에러 발생
        await expect(repository.getUserPoint(userId))
          .rejects.toThrow('Failed to get user point');
      });
    });
  });

  describe('getHistories', () => {
    describe('정상 케이스', () => {
      it('사용자의 포인트 내역을 조회해야 한다', async () => {
        // Given: 포인트 내역
        const userId = 1;
        const mockHistories = [
          {
            id: 1,
            userId: userId,
            amount: 1000,
            type: TransactionType.CHARGE,
            timeMillis: Date.now(),
          },
          {
            id: 2,
            userId: userId,
            amount: 500,
            type: TransactionType.USE,
            timeMillis: Date.now(),
          },
        ];
        
        mockPointHistoryTable.selectAllByUserId.mockResolvedValue(mockHistories);
        
        // When: 포인트 내역 조회
        const result = await repository.getHistories(userId);
        
        // Then: 내역 반환
        expect(result).toEqual(mockHistories);
        expect(result).toHaveLength(2);
        expect(result[0].type).toBe(TransactionType.CHARGE);
        expect(result[1].type).toBe(TransactionType.USE);
        expect(mockPointHistoryTable.selectAllByUserId).toHaveBeenCalledWith(userId);
      });
    });

    describe('예외 케이스', () => {
      it('데이터베이스 조회 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 데이터베이스 조회 실패
        const userId = 1;
        
        mockPointHistoryTable.selectAllByUserId.mockRejectedValue(
          new Error('Database connection failed')
        );
        
        // When & Then: 에러 발생
        await expect(repository.getHistories(userId))
          .rejects.toThrow('Failed to get point histories');
      });
    });
  });

  describe('updatePointWithHistory', () => {
    describe('정상 케이스', () => {
      it('포인트 업데이트와 내역 저장을 모두 수행해야 한다', async () => {
        // Given: 포인트 업데이트
        const userId = 1;
        const newPoint = 1000;
        const amount = 1000;
        const type = TransactionType.CHARGE;
        
        const mockUpdatedPoint = {
          id: userId,
          point: newPoint,
          updateMillis: Date.now(),
        };
        
        mockUserPointTable.insertOrUpdate.mockResolvedValue(mockUpdatedPoint);
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: userId,
          amount: amount,
          type: type,
          timeMillis: Date.now(),
        });
        
        // When: 포인트 업데이트 및 내역 저장
        const result = await repository.updatePointWithHistory(userId, newPoint, amount, type);
        
        // Then: 업데이트된 포인트 반환
        expect(result).toEqual(mockUpdatedPoint);
        expect(result.point).toBe(newPoint);
        expect(mockUserPointTable.insertOrUpdate).toHaveBeenCalledWith(userId, newPoint);
        expect(mockPointHistoryTable.insert).toHaveBeenCalledWith(
          userId,
          amount,
          type,
          expect.any(Number)
        );
      });
    });

    describe('예외 케이스', () => {
      it('데이터베이스 업데이트 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 데이터베이스 업데이트 실패
        const userId = 1;
        const newPoint = 1000;
        const amount = 1000;
        const type = TransactionType.CHARGE;
        
        mockUserPointTable.insertOrUpdate.mockRejectedValue(
          new Error('Update failed')
        );
        
        // When & Then: 에러 발생
        await expect(repository.updatePointWithHistory(userId, newPoint, amount, type))
          .rejects.toThrow('Failed to update point with history');
      });
    });
  });
}); 