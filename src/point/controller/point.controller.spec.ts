import { Test, TestingModule } from '@nestjs/testing';
import { PointController } from './point.controller';
import { PointService } from '../service/point.service';
import { UserPointTable } from '../../database/userpoint.table';
import { PointHistoryTable } from '../../database/pointhistory.table';
import { PointChargeDto, PointUserDto, PointUseDto, PointResponseDto } from '../dto/point.dto';
import { TransactionType, PointHistory } from '../point.model';

describe('PointController', () => {
  let controller: PointController;
  let service: PointService;
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
      controllers: [PointController],
      providers: [
        PointService,
        mockUserPointTableProvider,
        mockPointHistoryTableProvider,
      ],
    }).compile();

    controller = module.get<PointController>(PointController);
    service = module.get<PointService>(PointService);
    mockUserPointTable = module.get(UserPointTable);
    mockPointHistoryTable = module.get(PointHistoryTable);
  });

  describe('GET /point/:id (포인트 조회)', () => {
    describe('정상 케이스', () => {
      it('사용자의 포인트를 조회해야 한다', async () => {
        // Given: 사용자 포인트 정보
        const userId = 1;
        const mockUserPoint = {
          id: userId,
          point: 5000,
          updateMillis: Date.now(),
        };
        
        mockUserPointTable.selectById.mockResolvedValue(mockUserPoint);
        
        // When: 포인트 조회
        const result = await controller.point(userId.toString());
        
        // Then: 포인트 정보 반환
        expect(result).toEqual({
          userId: userId,
          currentBalance: 5000,
          timestamp: expect.any(Number),
        });
        expect(result.userId).toBe(userId);
        expect(result.currentBalance).toBe(5000);
        expect(mockUserPointTable.selectById).toHaveBeenCalledWith(userId);
      });

      it('포인트가 0인 사용자도 조회해야 한다', async () => {
        // Given: 포인트가 0인 사용자
        const userId = 2;
        const mockUserPoint = {
          id: userId,
          point: 0,
          updateMillis: Date.now(),
        };
        
        mockUserPointTable.selectById.mockResolvedValue(mockUserPoint);
        
        // When: 포인트 조회
        const result = await controller.point(userId.toString());
        
        // Then: 포인트 정보 반환
        expect(result).toEqual({
          userId: userId,
          currentBalance: 0,
          timestamp: expect.any(Number),
        });
        expect(result.currentBalance).toBe(0);
      });
    });

    describe('예외 케이스', () => {
      it('존재하지 않는 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 존재하지 않는 사용자
        const userId = 999;
        
        mockUserPointTable.selectById.mockRejectedValue(
          new Error('User not found')
        );
        
        // When & Then: 에러 발생
        await expect(controller.point(userId.toString()))
          .rejects.toThrow('User not found');
      });

      it('잘못된 사용자 ID 형식에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 잘못된 ID 형식
        const invalidIds = ['abc', '1.5', '-1', '0'];
        
        // When & Then: 각각 에러 발생
        for (const invalidId of invalidIds) {
          await expect(controller.point(invalidId))
            .rejects.toThrow();
        }
      });
    });
  });

  describe('GET /point/:id/histories (포인트 내역 조회)', () => {
    describe('정상 케이스', () => {
      it('사용자의 포인트 내역을 조회해야 한다', async () => {
        // Given: 포인트 내역
        const userId = 1;
        const mockHistories: PointHistory[] = [
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
        const result = await controller.history(userId.toString());
        
        // Then: 내역 반환
        expect(result).toEqual(mockHistories);
        expect(result).toHaveLength(2);
        expect(mockPointHistoryTable.selectAllByUserId).toHaveBeenCalledWith(userId);
      });

      it('내역이 없을 때는 빈 배열을 반환해야 한다', async () => {
        // Given: 내역이 없는 사용자
        const userId = 999;
        
        mockPointHistoryTable.selectAllByUserId.mockResolvedValue([]);
        
        // When: 포인트 내역 조회
        const result = await controller.history(userId.toString());
        
        // Then: 빈 배열 반환
        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
      });
    });

    describe('예외 케이스', () => {
      it('존재하지 않는 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 존재하지 않는 사용자
        const userId = 999;
        
        mockPointHistoryTable.selectAllByUserId.mockRejectedValue(
          new Error('User not found')
        );
        
        // When & Then: 에러 발생
        await expect(controller.history(userId.toString()))
          .rejects.toThrow('User not found');
      });
    });
  });

  describe('PATCH /point/:id/charge (포인트 충전)', () => {
    describe('정상 케이스', () => {
      it('사용자의 포인트를 충전해야 한다', async () => {
        // Given: 충전 요청
        const userId = 1;
        const chargeDto: PointChargeDto = { userId, amount: 1000 };
        const mockResponse: PointResponseDto = {
          userId: userId,
          currentBalance: 6000,
          transactionAmount: 1000,
          transactionType: 'CHARGE',
          timestamp: Date.now(),
        };
        
        jest.spyOn(service, 'addPoints').mockResolvedValue(mockResponse);
        
        // When: 포인트 충전
        const result = await controller.charge(userId.toString(), chargeDto);
        
        // Then: 충전 결과 반환
        expect(result).toEqual({
          userId: userId,
          currentBalance: 6000,
          transactionAmount: 1000,
          transactionType: 'CHARGE',
          timestamp: expect.any(Number),
        });
      });

      it('최소 충전 금액으로 충전해야 한다', async () => {
        // Given: 최소 충전 금액
        const userId = 1;
        const chargeDto: PointChargeDto = { userId, amount: 1000 };
        const mockResponse: PointResponseDto = {
          userId: userId,
          currentBalance: 1000,
          transactionAmount: 1000,
          transactionType: 'CHARGE',
          timestamp: Date.now(),
        };
        
        jest.spyOn(service, 'addPoints').mockResolvedValue(mockResponse);
        
        // When: 포인트 충전
        const result = await controller.charge(userId.toString(), chargeDto);
        
        // Then: 충전 결과 반환
        expect(result).toEqual({
          userId: userId,
          currentBalance: 1000,
          transactionAmount: 1000,
          transactionType: 'CHARGE',
          timestamp: expect.any(Number),
        });
      });
    });

    describe('예외 케이스', () => {
      it('잘못된 충전 금액에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 잘못된 충전 금액
        const userId = 1;
        const invalidChargeDto: PointChargeDto = { userId, amount: -100 };
        
        jest.spyOn(service, 'addPoints').mockRejectedValue(
          new Error('Cannot charge negative points')
        );
        
        // When & Then: 에러 발생
        await expect(controller.charge(userId.toString(), invalidChargeDto))
          .rejects.toThrow('Cannot charge negative points');
      });

      it('최소 충전 금액 미만에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 최소 충전 금액 미만
        const userId = 1;
        const invalidChargeDto: PointChargeDto = { userId, amount: 500 };
        
        jest.spyOn(service, 'addPoints').mockRejectedValue(
          new Error('Minimum charge amount is 1000 points')
        );
        
        // When & Then: 에러 발생
        await expect(controller.charge(userId.toString(), invalidChargeDto))
          .rejects.toThrow('Minimum charge amount is 1000 points');
      });
    });
  });

  describe('PATCH /point/:id/use (포인트 사용)', () => {
    describe('정상 케이스', () => {
      it('사용자의 포인트를 사용해야 한다', async () => {
        // Given: 포인트 사용 요청
        const userId = 1;
        const useDto: PointUseDto = { userId, amount: 500 };
        const mockResponse: PointResponseDto = {
          userId: userId,
          currentBalance: 4500,
          transactionAmount: 500,
          transactionType: 'USE',
          timestamp: Date.now(),
        };
        
        jest.spyOn(service, 'usePoints').mockResolvedValue(mockResponse);
        
        // When: 포인트 사용
        const result = await controller.use(userId.toString(), useDto);
        
        // Then: 사용 결과 반환
        expect(result).toEqual({
          userId: userId,
          currentBalance: 4500,
          transactionAmount: 500,
          transactionType: 'USE',
          timestamp: expect.any(Number),
        });
      });

      it('전체 잔고를 사용할 수 있어야 한다', async () => {
        // Given: 전체 잔고 사용
        const userId = 1;
        const useDto: PointUseDto = { userId, amount: 5000 };
        const mockResponse: PointResponseDto = {
          userId: userId,
          currentBalance: 0,
          transactionAmount: 5000,
          transactionType: 'USE',
          timestamp: Date.now(),
        };
        
        jest.spyOn(service, 'usePoints').mockResolvedValue(mockResponse);
        
        // When: 포인트 사용
        const result = await controller.use(userId.toString(), useDto);
        
        // Then: 사용 결과 반환
        expect(result).toEqual({
          userId: userId,
          currentBalance: 0,
          transactionAmount: 5000,
          transactionType: 'USE',
          timestamp: expect.any(Number),
        });
      });
    });

    describe('예외 케이스', () => {
      it('잔고 부족 시 에러를 발생시켜야 한다', async () => {
        // Given: 잔고 부족
        const userId = 1;
        const useDto: PointUseDto = { userId, amount: 10000 };
        
        jest.spyOn(service, 'usePoints').mockRejectedValue(
          new Error('Insufficient balance')
        );
        
        // When & Then: 에러 발생
        await expect(controller.use(userId.toString(), useDto))
          .rejects.toThrow('Insufficient balance');
      });

      it('잘못된 사용 금액에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 잘못된 사용 금액
        const userId = 1;
        const invalidUseDto: PointUseDto = { userId, amount: -100 };
        
        jest.spyOn(service, 'usePoints').mockRejectedValue(
          new Error('Cannot charge negative points')
        );
        
        // When & Then: 에러 발생
        await expect(controller.use(userId.toString(), invalidUseDto))
          .rejects.toThrow('Cannot charge negative points');
      });
    });
  });
}); 