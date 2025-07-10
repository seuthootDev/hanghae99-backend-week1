import { Test, TestingModule } from '@nestjs/testing';
import { PointService } from './point.service';
import { PointRepository } from '../repository/point.repository';
import { TransactionType } from '../point.model';
import { PointChargeDto, PointUserDto, PointResponseDto, PointUseDto } from '../dto/point.dto';

describe('PointService', () => {
  let service: PointService;
  let mockPointRepository: jest.Mocked<PointRepository>;

  beforeEach(async () => {
    const mockPointRepositoryProvider = {
      provide: PointRepository,
      useValue: {
        getUserPoint: jest.fn(),
        getHistories: jest.fn(),
        updatePointWithHistory: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointService,
        mockPointRepositoryProvider,
      ],
    }).compile();

    service = module.get<PointService>(PointService);
    mockPointRepository = module.get(PointRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addPoints (포인트 충전)', () => {
    describe('정상 케이스', () => {
      it('새로운 사용자에게 포인트를 추가하고 새로운 잔액을 반환해야 한다', async () => {
        // Given: 새로운 사용자에게 포인트 추가
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000, // 최소 충전 금액 1000원
        };
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockPointRepository.updatePointWithHistory.mockResolvedValue({
          id: dto.userId,
          point: dto.amount,
          updateMillis: Date.now(),
        });
        
        // When: 포인트 추가
        const result: PointResponseDto = await service.addPoints(dto);
        
        // Then: 새로운 잔액 반환
        expect(result.currentBalance).toBe(1000);
        expect(result.transactionType).toBe('CHARGE');
        expect(mockPointRepository.getUserPoint).toHaveBeenCalledWith(dto.userId);
      });



      it('여러 사용자를 독립적으로 처리해야 한다', async () => {
        // Given: 여러 사용자
        const dto1: PointChargeDto = { userId: 1, amount: 1000 };
        const dto2: PointChargeDto = { userId: 2, amount: 2000 };
        
        mockPointRepository.getUserPoint
          .mockResolvedValueOnce({
            id: dto1.userId,
            point: 0,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: dto2.userId,
            point: 0,
            updateMillis: Date.now(),
          });
        
        mockPointRepository.updatePointWithHistory
          .mockResolvedValueOnce({
            id: dto1.userId,
            point: 1000,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: dto2.userId,
            point: 2000,
            updateMillis: Date.now(),
          });
        
        // When: 각각 다른 포인트 추가
        const result1: PointResponseDto = await service.addPoints(dto1);
        const result2: PointResponseDto = await service.addPoints(dto2);
        
        // Then: 각각 독립적으로 관리
        expect(result1.currentBalance).toBe(1000);
        expect(result2.currentBalance).toBe(2000);
      });
    });

    describe('정책 검증', () => {
      it('최대 잔고까지 충전을 허용해야 한다', async () => {
        // Given: 최대 잔고까지 충전
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000000, // 100만 포인트
        };
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockPointRepository.updatePointWithHistory.mockResolvedValue({
          id: dto.userId,
          point: dto.amount,
          updateMillis: Date.now(),
        });
        
        // When: 최대 잔고까지 충전
        const result: PointResponseDto = await service.addPoints(dto);
        
        // Then: 최대 잔고까지 허용
        expect(result.currentBalance).toBe(dto.amount);
        expect(result.transactionType).toBe('CHARGE');
      });
    });

    describe('예외 케이스', () => {
      it('최소 충전 금액 미만일 때 에러를 발생시켜야 한다', async () => {
        // Given: 최소 충전 금액 미만
        const dto: PointChargeDto = {
          userId: 1,
          amount: 500, // 최소 1000원 미만
        };
        
        // When & Then: 최소 충전 금액 미만 시 에러 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('Minimum charge amount is 1000 points');
      });

      it.each([
        { userId: 0, amount: 1000, description: '0인 사용자 ID' },
        { userId: -1, amount: 1000, description: '음수 사용자 ID' },
        { userId: 1, amount: -50, description: '음수 포인트' },
        { userId: 1, amount: 1000.5, description: '소수점 포인트' },
      ])('$description에 대해 에러를 발생시켜야 한다', async ({ userId, amount }) => {
        // Given: 잘못된 입력값
        const dto: PointChargeDto = { userId, amount };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.addPoints(dto))
          .rejects.toThrow();
      });
    });
  });

  describe('getUserPoint (포인트 조회)', () => {
    describe('정상 케이스', () => {
      it('기존 사용자의 포인트를 조회해야 한다', async () => {
        // Given: 기존 사용자 포인트
        const dto: PointUserDto = {
          userId: 1,
        };
        const expectedPoints = 5000;
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: expectedPoints,
          updateMillis: Date.now(),
        });
        
        // When: 포인트 조회
        const result: PointResponseDto = await service.getUserPoint(dto);
        
        // Then: 정확한 포인트 반환
        expect(result.currentBalance).toBe(expectedPoints);
        expect(result.userId).toBe(dto.userId);
        expect(mockPointRepository.getUserPoint).toHaveBeenCalledWith(dto.userId);
      });

      it('새로운 사용자의 포인트는 0을 반환해야 한다', async () => {
        // Given: 새로운 사용자 (기본값 0)
        const dto: PointUserDto = {
          userId: 999,
        };
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        
        // When: 포인트 조회
        const result: PointResponseDto = await service.getUserPoint(dto);
        
        // Then: 0 반환
        expect(result.currentBalance).toBe(0);
        expect(result.userId).toBe(dto.userId);
        expect(mockPointRepository.getUserPoint).toHaveBeenCalledWith(dto.userId);
      });
    });

    describe('예외 케이스', () => {
      it.each([
        { userId: 0, description: '0인 사용자 ID' },
        { userId: -1, description: '음수 사용자 ID' },
        { userId: 1.5, description: '소수점 사용자 ID' },
      ])('$description에 대해 에러를 발생시켜야 한다', async ({ userId }) => {
        // Given: 잘못된 사용자 ID
        const dto: PointUserDto = { userId };
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        await expect(service.getUserPoint(dto))
          .rejects.toThrow();
      });
    });
  });

  describe('usePoints (포인트 사용)', () => {
    describe('정상 케이스', () => {
      it('포인트를 사용하고 남은 잔액을 반환해야 한다', async () => {
        // Given: 포인트 사용
        const dto: PointUseDto = {
          userId: 1,
          amount: 500,
        };
        const initialBalance = 1000;
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: initialBalance,
          updateMillis: Date.now(),
        });
        mockPointRepository.updatePointWithHistory.mockResolvedValue({
          id: dto.userId,
          point: initialBalance - dto.amount,
          updateMillis: Date.now(),
        });
        
        // When: 포인트 사용
        const result: PointResponseDto = await service.usePoints(dto);
        
        // Then: 남은 잔액 반환
        expect(result.currentBalance).toBe(500); // 1000 - 500
        expect(result.transactionType).toBe('USE');
        expect(mockPointRepository.getUserPoint).toHaveBeenCalledWith(dto.userId);
      });
    });

    describe('잔고 부족 케이스', () => {
      it.each([
        { currentBalance: 1000, useAmount: 1001, description: '잔고보다 1 많은 금액' },
        { currentBalance: 500, useAmount: 600, description: '잔고보다 많은 금액' },
        { currentBalance: 0, useAmount: 1, description: '잔고가 0일 때 1 포인트' },
        { currentBalance: 100, useAmount: 200, description: '잔고의 2배 금액' },
      ])('$description 사용을 시도하면 실패한다', async ({ currentBalance, useAmount }) => {
        // Given: 잔고 부족
        const dto: PointUseDto = {
          userId: 1,
          amount: useAmount,
        };
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: currentBalance,
          updateMillis: Date.now(),
        });
        
        // When & Then: 잔고 부족 시 예외 발생
        await expect(service.usePoints(dto))
          .rejects.toThrow('Insufficient balance');
      });

      it('사용 금액이 잔고와 정확히 같을 때는 허용해야 한다', async () => {
        // Given: 사용 금액 = 잔고
        const dto: PointUseDto = {
          userId: 1,
          amount: 1000,
        };
        const balance = 1000;
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: balance,
          updateMillis: Date.now(),
        });
        mockPointRepository.updatePointWithHistory.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        
        // When: 정확히 같은 금액 사용
        const result: PointResponseDto = await service.usePoints(dto);
        
        // Then: 성공해야 함
        expect(result.currentBalance).toBe(0);
        expect(result.transactionType).toBe('USE');
      });
    });

    describe('예외 케이스', () => {
      it.each([
        { amount: -100, description: '음수 포인트' },
        { amount: 0, description: '0 포인트' },
        { amount: 100.5, description: '소수점 포인트' },
      ])('$description 사용을 시도하면 실패한다', async ({ amount }) => {
        // Given: 잘못된 사용 금액
        const dto: PointUseDto = {
          userId: 1,
          amount,
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.usePoints(dto))
          .rejects.toThrow();
      });

      it.each([
        { userId: 0, amount: 100, description: '0인 사용자 ID' },
        { userId: -1, amount: 100, description: '음수 사용자 ID' },
      ])('$description에 대해 에러를 발생시켜야 한다', async ({ userId, amount }) => {
        // Given: 잘못된 사용자 ID
        const dto: PointUseDto = { userId, amount };
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        await expect(service.usePoints(dto))
          .rejects.toThrow();
      });
    });
  });

  describe('getPointHistory (포인트 내역 조회)', () => {
    describe('정상 케이스', () => {
      it('사용자의 포인트 내역을 조회해야 한다', async () => {
        // Given: 사용자 포인트 내역
        const dto: PointUserDto = {
          userId: 1,
        };
        const mockHistories = [
          {
            id: 1,
            userId: dto.userId,
            amount: 1000,
            type: TransactionType.CHARGE,
            timeMillis: Date.now(),
          },
          {
            id: 2,
            userId: dto.userId,
            amount: 500,
            type: TransactionType.USE,
            timeMillis: Date.now(),
          },
        ];
        
        mockPointRepository.getHistories.mockResolvedValue(mockHistories);
        
        // When: 포인트 내역 조회
        const result = await service.getPointHistory(dto);
        
        // Then: 내역 반환
        expect(result).toEqual(mockHistories);
        expect(result).toHaveLength(2);
        expect(result[0].type).toBe(TransactionType.CHARGE);
        expect(result[1].type).toBe(TransactionType.USE);
        expect(mockPointRepository.getHistories).toHaveBeenCalledWith(dto.userId);
      });
    });

    describe('예외 케이스', () => {
      it.each([
        { userId: 0, description: '0인 사용자 ID' },
        { userId: -1, description: '음수 사용자 ID' },
      ])('$description에 대해 에러를 발생시켜야 한다', async ({ userId }) => {
        // Given: 잘못된 사용자 ID
        const dto: PointUserDto = { userId };
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        await expect(service.getPointHistory(dto))
          .rejects.toThrow();
      });
    });
  });

  describe('동시성 테스트', () => {
    describe('동시 포인트 사용', () => {
      it('동시에 같은 사용자의 포인트를 사용할 때 잔고 부족 검증이 제대로 작동해야 한다', async () => {
        // Given: 잔고 1000원, 동시에 800원씩 사용 요청
        const userId = 1;
        const initialBalance = 1000;
        const useAmount = 800;
        
        // 첫 번째 요청: 잔고 조회 → 검증 통과 → 차감
        mockPointRepository.getUserPoint
          .mockResolvedValueOnce({
            id: userId,
            point: initialBalance,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: userId,
            point: initialBalance - useAmount, // 첫 번째 차감 후 잔고
            updateMillis: Date.now(),
          });
        
        mockPointRepository.updatePointWithHistory
          .mockResolvedValueOnce({
            id: userId,
            point: initialBalance - useAmount,
            updateMillis: Date.now(),
          });
        
        // When: 동시에 두 개의 포인트 사용 요청
        const request1 = service.usePoints({ userId, amount: useAmount });
        const request2 = service.usePoints({ userId, amount: useAmount });
        
        // Then: 첫 번째는 성공, 두 번째는 실패
        const result1 = await request1;
        expect(result1.currentBalance).toBe(200); // 1000 - 800
        
        await expect(request2).rejects.toThrow('Insufficient balance');
      });

      it('동시에 충전과 사용이 들어올 때 순차적으로 처리되어야 한다', async () => {
        // Given: 잔고 0원, 동시에 충전(1000원)과 사용(500원) 요청
        const userId = 1;
        const chargeAmount = 1000;
        const useAmount = 500;
        
        // 충전 요청: 잔고 조회 → 충전
        mockPointRepository.getUserPoint
          .mockResolvedValueOnce({
            id: userId,
            point: 0,
            updateMillis: Date.now(),
          });
        
        mockPointRepository.updatePointWithHistory
          .mockResolvedValueOnce({
            id: userId,
            point: chargeAmount,
            updateMillis: Date.now(),
          });
        
        // 사용 요청: 충전 후 잔고 조회 → 사용
        mockPointRepository.getUserPoint
          .mockResolvedValueOnce({
            id: userId,
            point: chargeAmount,
            updateMillis: Date.now(),
          });
        
        mockPointRepository.updatePointWithHistory
          .mockResolvedValueOnce({
            id: userId,
            point: chargeAmount - useAmount,
            updateMillis: Date.now(),
          });
        
        // When: 동시에 충전과 사용 요청
        const chargeRequest = service.addPoints({ userId, amount: chargeAmount });
        const useRequest = service.usePoints({ userId, amount: useAmount });
        
        // Then: 순차적으로 처리되어 모두 성공
        const chargeResult = await chargeRequest;
        const useResult = await useRequest;
        
        expect(chargeResult.currentBalance).toBe(1000);
        expect(useResult.currentBalance).toBe(500);
      });
    });

    describe('동시 포인트 충전', () => {
      it('동시에 같은 사용자에게 충전할 때 순차적으로 처리되어야 한다', async () => {
        // Given: 잔고 0원, 동시에 1000원씩 충전 요청
        const userId = 1;
        const chargeAmount = 1000;
        
        // 첫 번째 충전
        mockPointRepository.getUserPoint
          .mockResolvedValueOnce({
            id: userId,
            point: 0,
            updateMillis: Date.now(),
          });
        
        mockPointRepository.updatePointWithHistory
          .mockResolvedValueOnce({
            id: userId,
            point: chargeAmount,
            updateMillis: Date.now(),
          });
        
        // 두 번째 충전
        mockPointRepository.getUserPoint
          .mockResolvedValueOnce({
            id: userId,
            point: chargeAmount,
            updateMillis: Date.now(),
          });
        
        mockPointRepository.updatePointWithHistory
          .mockResolvedValueOnce({
            id: userId,
            point: chargeAmount * 2,
            updateMillis: Date.now(),
          });
        
        // When: 동시에 두 개의 충전 요청
        const request1 = service.addPoints({ userId, amount: chargeAmount });
        const request2 = service.addPoints({ userId, amount: chargeAmount });
        
        // Then: 순차적으로 처리되어 모두 성공
        const result1 = await request1;
        const result2 = await request2;
        
        expect(result1.currentBalance).toBe(1000);
        expect(result2.currentBalance).toBe(2000);
      });
    });

    describe('다른 사용자 간 독립성', () => {
      it('다른 사용자의 포인트 사용은 서로 영향을 주지 않아야 한다', async () => {
        // Given: 두 사용자, 각각 잔고 1000원
        const user1 = 1;
        const user2 = 2;
        const useAmount = 500;
        
        // 실제 잔고 상태를 시뮬레이션
        let user1Balance = 1000;
        let user2Balance = 1000;
        
        // 사용자별로 다른 잔고를 반환하도록 모킹
        mockPointRepository.getUserPoint.mockImplementation(async (userId) => {
          if (userId === user1) {
            return {
              id: user1,
              point: user1Balance,
              updateMillis: Date.now(),
            };
          } else if (userId === user2) {
            return {
              id: user2,
              point: user2Balance,
              updateMillis: Date.now(),
            };
          }
          return {
            id: userId,
            point: 0,
            updateMillis: Date.now(),
          };
        });
        
        mockPointRepository.updatePointWithHistory.mockImplementation(async (userId, newBalance, amount, type) => {
          if (userId === user1) {
            user1Balance = newBalance;
          } else if (userId === user2) {
            user2Balance = newBalance;
          }
          return {
            id: userId,
            point: newBalance,
            updateMillis: Date.now(),
          };
        });
        
        // 첫 번째 사용 (잔고 1000 → 500)
        const user1Result1 = await service.usePoints({ userId: user1, amount: useAmount });
        const user2Result1 = await service.usePoints({ userId: user2, amount: useAmount });
        expect(user1Result1.currentBalance).toBe(500);
        expect(user2Result1.currentBalance).toBe(500);
        
        // 두 번째 사용 (잔고 500 → 0)
        const user1Result2 = await service.usePoints({ userId: user1, amount: useAmount });
        const user2Result2 = await service.usePoints({ userId: user2, amount: useAmount });
        expect(user1Result2.currentBalance).toBe(0);
        expect(user2Result2.currentBalance).toBe(0);
        
        // 세 번째 사용 (잔고 0 → 실패)
        await expect(service.usePoints({ userId: user1, amount: useAmount }))
          .rejects.toThrow('Insufficient balance');
        await expect(service.usePoints({ userId: user2, amount: useAmount }))
          .rejects.toThrow('Insufficient balance');
      });
    });
  });

  describe('실제 동시성 테스트', () => {
    it('실제로 동시에 포인트 사용 요청이 들어올 때 뮤텍스가 작동해야 한다', async () => {
      // Given: 잔고 1000원
      const userId = 1;
      const useAmount = 800;
      let currentBalance = 1000;
      
      // 실제 레포지토리 동작을 시뮬레이션
      mockPointRepository.getUserPoint.mockImplementation(async (id) => {
        return {
          id,
          point: currentBalance,
          updateMillis: Date.now(),
        };
      });
      
      mockPointRepository.updatePointWithHistory.mockImplementation(async (id, newBalance, amount, type) => {
        // 실제로 잔고를 업데이트
        currentBalance = newBalance;
        return {
          id,
          point: newBalance,
          updateMillis: Date.now(),
        };
      });
      
      // When: 실제로 동시에 두 개의 요청
      const request1 = service.usePoints({ userId, amount: useAmount });
      const request2 = service.usePoints({ userId, amount: useAmount });
      
      // Then: 첫 번째는 성공, 두 번째는 실패
      const result1 = await request1;
      expect(result1.currentBalance).toBe(200); // 1000 - 800
      
      await expect(request2).rejects.toThrow('Insufficient balance');
    });

    it('실제로 동시에 충전과 사용이 들어올 때 순차적으로 처리되어야 한다', async () => {
      // Given: 잔고 0원
      const userId = 1;
      const chargeAmount = 1000;
      const useAmount = 500;
      let currentBalance = 0;
      
      // 실제 레포지토리 동작을 시뮬레이션
      mockPointRepository.getUserPoint.mockImplementation(async (id) => {
        return {
          id,
          point: currentBalance,
          updateMillis: Date.now(),
        };
      });
      
      mockPointRepository.updatePointWithHistory.mockImplementation(async (id, newBalance, amount, type) => {
        currentBalance = newBalance;
        return {
          id,
          point: newBalance,
          updateMillis: Date.now(),
        };
      });
      
      // When: 실제로 동시에 충전과 사용 요청
      const chargeRequest = service.addPoints({ userId, amount: chargeAmount });
      const useRequest = service.usePoints({ userId, amount: useAmount });
      
      // Then: 순차적으로 처리되어 모두 성공
      const chargeResult = await chargeRequest;
      const useResult = await useRequest;
      
      expect(chargeResult.currentBalance).toBe(1000);
      expect(useResult.currentBalance).toBe(500);
    });

    it('Promise.all을 사용한 실제 동시 요청 테스트', async () => {
      // Given: 잔고 1000원
      const userId = 1;
      const useAmount = 600;
      let currentBalance = 1000;
      
      mockPointRepository.getUserPoint.mockImplementation(async (id) => {
        return {
          id,
          point: currentBalance,
          updateMillis: Date.now(),
        };
      });
      
      mockPointRepository.updatePointWithHistory.mockImplementation(async (id, newBalance, amount, type) => {
        currentBalance = newBalance;
        return {
          id,
          point: newBalance,
          updateMillis: Date.now(),
        };
      });
      
      // When: Promise.all로 동시 요청
      const requests = [
        service.usePoints({ userId, amount: useAmount }),
        service.usePoints({ userId, amount: useAmount }),
      ];
      
      // Then: 첫 번째는 성공, 두 번째는 실패
      const results = await Promise.allSettled(requests);
      
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      
      if (results[0].status === 'fulfilled') {
        expect(results[0].value.currentBalance).toBe(400); // 1000 - 600
      }
      
      if (results[1].status === 'rejected') {
        expect(results[1].reason.message).toBe('Insufficient balance');
      }
    });
  });
}); 