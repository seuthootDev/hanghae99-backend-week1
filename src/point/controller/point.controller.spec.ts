import { Test, TestingModule } from '@nestjs/testing';
import { PointController } from './point.controller';
import { PointService } from '../service/point.service';
import { PointChargeDto, PointUserDto, PointUseDto, PointResponseDto } from '../dto/point.dto';
import { TransactionType, PointHistory } from '../point.model';

describe('PointController', () => {
  let controller: PointController;
  let mockPointService: jest.Mocked<PointService>;

  beforeEach(async () => {
    const mockPointServiceProvider = {
      provide: PointService,
      useValue: {
        addPoints: jest.fn(),
        getUserPoint: jest.fn(),
        usePoints: jest.fn(),
        getPointHistory: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PointController],
      providers: [
        mockPointServiceProvider,
      ],
    }).compile();

    controller = module.get<PointController>(PointController);
    mockPointService = module.get(PointService);
  });

  describe('GET /point/:id (포인트 조회)', () => {
    describe('정상 케이스', () => {
      it('사용자의 포인트를 조회해야 한다', async () => {
        // Given: 사용자 포인트 정보
        const userId = 1;
        const mockResponse: PointResponseDto = {
          userId: userId,
          currentBalance: 5000,
          timestamp: Date.now(),
        };
        
        mockPointService.getUserPoint.mockResolvedValue(mockResponse);
        
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
        expect(mockPointService.getUserPoint).toHaveBeenCalledWith({ userId });
      });
    });

    describe('예외 케이스', () => {
      it('서비스에서 에러가 발생하면 에러를 전파해야 한다', async () => {
        // Given: 서비스에서 에러 발생
        const userId = 999;
        
        mockPointService.getUserPoint.mockRejectedValue(
          new Error('User not found')
        );
        
        // When & Then: 에러 발생
        await expect(controller.point(userId.toString()))
          .rejects.toThrow('User not found');
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
        
        mockPointService.getPointHistory.mockResolvedValue(mockHistories);
        
        // When: 포인트 내역 조회
        const result = await controller.history(userId.toString());
        
        // Then: 내역 반환
        expect(result).toEqual(mockHistories);
        expect(result).toHaveLength(2);
        expect(mockPointService.getPointHistory).toHaveBeenCalledWith({ userId });
      });


    });

    describe('예외 케이스', () => {
      it('서비스에서 에러가 발생하면 에러를 전파해야 한다', async () => {
        // Given: 서비스에서 에러 발생
        const userId = 999;
        
        mockPointService.getPointHistory.mockRejectedValue(
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
        
        mockPointService.addPoints.mockResolvedValue(mockResponse);
        
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
        expect(mockPointService.addPoints).toHaveBeenCalledWith(chargeDto);
      });


    });

    describe('예외 케이스', () => {
      it('서비스에서 에러가 발생하면 에러를 전파해야 한다', async () => {
        // Given: 서비스에서 에러 발생
        const userId = 1;
        const invalidChargeDto: PointChargeDto = { userId, amount: -100 };
        
        mockPointService.addPoints.mockRejectedValue(
          new Error('Cannot charge negative points')
        );
        
        // When & Then: 에러 발생
        await expect(controller.charge(userId.toString(), invalidChargeDto))
          .rejects.toThrow('Cannot charge negative points');
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
        
        mockPointService.usePoints.mockResolvedValue(mockResponse);
        
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
        expect(mockPointService.usePoints).toHaveBeenCalledWith(useDto);
      });


    });

    describe('예외 케이스', () => {
      it('서비스에서 에러가 발생하면 에러를 전파해야 한다', async () => {
        // Given: 서비스에서 에러 발생
        const userId = 1;
        const useDto: PointUseDto = { userId, amount: 10000 };
        
        mockPointService.usePoints.mockRejectedValue(
          new Error('Insufficient balance')
        );
        
        // When & Then: 에러 발생
        await expect(controller.use(userId.toString(), useDto))
          .rejects.toThrow('Insufficient balance');
      });
    });
  });
}); 