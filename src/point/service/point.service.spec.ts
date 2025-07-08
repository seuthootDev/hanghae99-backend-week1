import { Test, TestingModule } from '@nestjs/testing';
import { PointService } from './point.service';
import { PointRepository } from '../repository/point.repository';
import { TransactionType } from '../point.model';
import { PointChargeDto, PointUserDto, PointResponseDto,PointUseDto } from '../dto/point.dto';

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
          amount: 1000, // 최소 충전 금액
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
        expect(result.userId).toBe(dto.userId);
        expect(result.transactionAmount).toBe(dto.amount);
        expect(result.transactionType).toBe('CHARGE');
        expect(result.timestamp).toBeDefined();
        expect(mockPointRepository.getUserPoint).toHaveBeenCalledWith(dto.userId);
        expect(mockPointRepository.updatePointWithHistory).toHaveBeenCalledWith(
          dto.userId,
          dto.amount,
          dto.amount,
          TransactionType.CHARGE
        );
      });

      it('기존 사용자의 포인트를 누적해야 한다', async () => {
        // Given: 기존 사용자에게 포인트 추가
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000,
        };
        const initialPoints = 1000;
        
        mockPointRepository.getUserPoint
          .mockResolvedValueOnce({
            id: dto.userId,
            point: 0,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: dto.userId,
            point: initialPoints,
            updateMillis: Date.now(),
          });
        mockPointRepository.updatePointWithHistory.mockResolvedValue({
          id: dto.userId,
          point: initialPoints + dto.amount,
          updateMillis: Date.now(),
        });
        
        // When: 첫 번째 충전
        await service.addPoints(dto);
        
        // When: 추가 포인트 충전
        const result: PointResponseDto = await service.addPoints(dto);
        
        // Then: 누적된 잔액 반환
        expect(result.currentBalance).toBe(2000);
        expect(result.transactionAmount).toBe(dto.amount);
        expect(result.transactionType).toBe('CHARGE');
      });

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
          })
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
        
        mockPointRepository.updatePointWithHistory.mockResolvedValue({
          id: 1,
          point: 1000,
          updateMillis: Date.now(),
        });
        
        // When: 각각 다른 포인트 추가
        await service.addPoints(dto1);
        await service.addPoints(dto2);
        
        mockPointRepository.getUserPoint
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
        
        mockPointRepository.updatePointWithHistory
          .mockResolvedValueOnce({
            id: dto1.userId,
            point: 2000,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: dto2.userId,
            point: 4000,
            updateMillis: Date.now(),
          });
        
        const result1: PointResponseDto = await service.addPoints(dto1);
        const result2: PointResponseDto = await service.addPoints(dto2);
        
        // Then: 각각 독립적으로 관리
        expect(result1.currentBalance).toBe(2000); // user1: 1000 + 1000
        expect(result2.currentBalance).toBe(4000); // user2: 2000 + 2000
      });
    });

    describe('정책 검증 (최대 잔고)', () => {
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

      it('최대 잔고를 초과할 때 에러를 발생시켜야 한다', async () => {
        // Given: 최대 잔고 초과 충전
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000001, // 최대 잔고 초과
        };
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        
        // When & Then: 최대 잔고 초과 시 예외 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('Maximum balance exceeded');
      });

      it('누적 잔고가 최대 잔고를 초과할 때 에러를 발생시켜야 한다', async () => {
        // Given: 기존 잔고 + 추가 충전이 최대 잔고 초과
        const dto: PointChargeDto = {
          userId: 1,
          amount: 2000,
        };
        const maxBalance = 1000000;
        const currentBalance = maxBalance - 1000; // 999000
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: currentBalance,
          updateMillis: Date.now(),
        });
        
        // When & Then: 추가 충전 시 최대 잔고 초과 예외 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('Maximum balance exceeded');
      });
    });

    describe('예외 케이스', () => {
      it('음수 포인트에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 음수 포인트 충전 시도 (DTO 검증에서 차단됨)
        const dto: PointChargeDto = {
          userId: 1,
          amount: -50, // DTO 검증에서 차단
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.addPoints(dto))
          .rejects.toThrow();
      });

      it('0이거나 음수인 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 잘못된 사용자 ID
        const invalidDtos = [
          { userId: 0, amount: 1000 },
          { userId: -1, amount: 1000 },
          { userId: -100, amount: 1000 },
        ];
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        for (const dto of invalidDtos) {
          await expect(service.addPoints(dto as PointChargeDto))
            .rejects.toThrow();
        }
      });

      it('정수가 아닌 포인트에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 소수점 포인트 (DTO 검증에서 차단됨)
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000.5, // DTO 검증에서 차단
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.addPoints(dto))
          .rejects.toThrow();
      });
    });

    describe('경계값 테스트', () => {
      it('최대 정수값에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 최대 정수값 (메모리 문제 가능성)
        const dto: PointChargeDto = {
          userId: 1,
          amount: Number.MAX_SAFE_INTEGER, // DTO 검증에서 차단
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.addPoints(dto))
          .rejects.toThrow();
      });

      it('매우 큰 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 매우 큰 사용자 ID (성능 문제 가능성)
        const dto: PointChargeDto = {
          userId: 999999999999, // DTO 검증에서 차단
          amount: 1000,
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.addPoints(dto))
          .rejects.toThrow();
      });
    });

    describe('데이터베이스 오류 케이스', () => {
      it('사용자 포인트 조회 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 데이터베이스 조회 실패
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Database connection failed')
        );
        
        // When & Then: 데이터베이스 오류 시 예외 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('Database connection failed');
      });

      it('포인트 업데이트 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 포인트 업데이트 실패
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000,
        };
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockPointRepository.updatePointWithHistory.mockRejectedValue(
          new Error('Update failed')
        );
        
        // When & Then: 업데이트 실패 시 예외 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('Update failed');
      });
    });

    describe('네트워크 및 시스템 오류 케이스', () => {
      it('타임아웃 발생 시 에러를 발생시켜야 한다', async () => {
        // Given: 네트워크 타임아웃
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Request timeout')
        );
        
        // When & Then: 타임아웃 시 예외 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('Request timeout');
      });

      it('메모리 부족 시 에러를 발생시켜야 한다', async () => {
        // Given: 메모리 부족 상황
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Out of memory')
        );
        
        // When & Then: 메모리 부족 시 예외 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('Out of memory');
      });
    });
  });

  // getUserPoint 테스트
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
        expect(result.timestamp).toBeDefined();
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

      it('여러 사용자의 포인트를 독립적으로 조회해야 한다', async () => {
        // Given: 여러 사용자
        const dto1: PointUserDto = { userId: 1 };
        const dto2: PointUserDto = { userId: 2 };
        
        mockPointRepository.getUserPoint
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
        
        // When: 각각 조회
        const result1: PointResponseDto = await service.getUserPoint(dto1);
        const result2: PointResponseDto = await service.getUserPoint(dto2);
        
        // Then: 각각 독립적인 결과
        expect(result1.currentBalance).toBe(1000);
        expect(result2.currentBalance).toBe(2000);
        expect(mockPointRepository.getUserPoint).toHaveBeenCalledTimes(2);
      });
    });

    describe('예외 케이스', () => {
      it('0이거나 음수인 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 잘못된 사용자 ID
        const invalidDtos = [
          { userId: 0 },
          { userId: -1 },
          { userId: -100 },
        ];
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        for (const dto of invalidDtos) {
          await expect(service.getUserPoint(dto as PointUserDto))
            .rejects.toThrow();
        }
      });

      it('정수가 아닌 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 소수점 사용자 ID
        const dto: PointUserDto = {
          userId: 1.5, // DTO 검증에서 차단
        };
        
        // When & Then: 소수점 사용자 ID 시 예외 발생
        await expect(service.getUserPoint(dto))
          .rejects.toThrow();
      });
    });

    describe('경계값 테스트', () => {
      it('매우 큰 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 매우 큰 사용자 ID (성능 문제 가능성)
        const dto: PointUserDto = {
          userId: 999999999999, // DTO 검증에서 차단
        };
        
        // When & Then: 매우 큰 사용자 ID 시 에러 발생
        await expect(service.getUserPoint(dto))
          .rejects.toThrow();
      });

      it('최대 정수값 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 최대 정수값 사용자 ID
        const dto: PointUserDto = {
          userId: Number.MAX_SAFE_INTEGER, // DTO 검증에서 차단
        };
        
        // When & Then: 최대 정수값 시 에러 발생
        await expect(service.getUserPoint(dto))
          .rejects.toThrow();
      });
    });

    describe('데이터베이스 오류 케이스', () => {
      it('사용자 포인트 조회 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 데이터베이스 조회 실패
        const dto: PointUserDto = {
          userId: 1,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Database connection failed')
        );
        
        // When & Then: 데이터베이스 오류 시 예외 발생
        await expect(service.getUserPoint(dto))
          .rejects.toThrow('Database connection failed');
      });

      it('네트워크 타임아웃 시 에러를 발생시켜야 한다', async () => {
        // Given: 네트워크 타임아웃
        const dto: PointUserDto = {
          userId: 1,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Request timeout')
        );
        
        // When & Then: 타임아웃 시 예외 발생
        await expect(service.getUserPoint(dto))
          .rejects.toThrow('Request timeout');
      });

      it('메모리 부족 시 에러를 발생시켜야 한다', async () => {
        // Given: 메모리 부족 상황
        const dto: PointUserDto = {
          userId: 1,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Out of memory')
        );
        
        // When & Then: 메모리 부족 시 예외 발생
        await expect(service.getUserPoint(dto))
          .rejects.toThrow('Out of memory');
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
        expect(result.userId).toBe(dto.userId);
        expect(result.transactionAmount).toBe(dto.amount);
        expect(result.transactionType).toBe('USE');
        expect(result.timestamp).toBeDefined();
        expect(mockPointRepository.getUserPoint).toHaveBeenCalledWith(dto.userId);
        expect(mockPointRepository.updatePointWithHistory).toHaveBeenCalledWith(
          dto.userId,
          500,
          dto.amount,
          TransactionType.USE
        );
      });

      it('전체 잔액을 사용할 수 있어야 한다', async () => {
        // Given: 전체 잔액 사용
        const dto: PointUseDto = {
          userId: 1,
          amount: 1000,
        };
        const initialBalance = 1000;
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: initialBalance,
          updateMillis: Date.now(),
        });
        mockPointRepository.updatePointWithHistory.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        
        // When: 전체 잔액 사용
        const result: PointResponseDto = await service.usePoints(dto);
        
        // Then: 잔액 0 반환
        expect(result.currentBalance).toBe(0);
        expect(result.transactionType).toBe('USE');
      });

      it('여러 사용자가 독립적으로 포인트를 사용해야 한다', async () => {
        // Given: 여러 사용자
        const dto1: PointUseDto = { userId: 1, amount: 500 };
        const dto2: PointUseDto = { userId: 2, amount: 300 };
        
        mockPointRepository.getUserPoint
          .mockResolvedValueOnce({
            id: dto1.userId,
            point: 1000,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: dto2.userId,
            point: 800,
            updateMillis: Date.now(),
          });
        
        mockPointRepository.updatePointWithHistory
          .mockResolvedValueOnce({
            id: dto1.userId,
            point: 500,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: dto2.userId,
            point: 500,
            updateMillis: Date.now(),
          });
        
        // When: 각각 포인트 사용
        const result1: PointResponseDto = await service.usePoints(dto1);
        const result2: PointResponseDto = await service.usePoints(dto2);
        
        // Then: 각각 독립적으로 처리
        expect(result1.currentBalance).toBe(500); // user1: 1000 - 500
        expect(result2.currentBalance).toBe(500); // user2: 800 - 300
        expect(result1.transactionType).toBe('USE');
        expect(result2.transactionType).toBe('USE');
      });
    });

    describe('잔고 부족 케이스', () => {
      it('잔고 부족 시 에러를 발생시켜야 한다', async () => {
        // Given: 잔고 부족
        const dto: PointUseDto = {
          userId: 1,
          amount: 1000,
        };
        const insufficientBalance = 500;
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: insufficientBalance,
          updateMillis: Date.now(),
        });
        
        // When & Then: 잔고 부족 시 예외 발생
        await expect(service.usePoints(dto))
          .rejects.toThrow('Insufficient balance');
      });

      it('잔고가 0일 때 사용 시도하면 에러를 발생시켜야 한다', async () => {
        // Given: 잔고 0
        const dto: PointUseDto = {
          userId: 1,
          amount: 100,
        };
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        
        // When & Then: 잔고 0 시 예외 발생
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
      it('음수 포인트 사용 시 에러를 발생시켜야 한다', async () => {
        // Given: 음수 포인트 사용 (DTO 검증에서 차단됨)
        const dto: PointUseDto = {
          userId: 1,
          amount: -100, // DTO 검증에서 차단
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.usePoints(dto))
          .rejects.toThrow();
      });

      it('0 포인트 사용 시 에러를 발생시켜야 한다', async () => {
        // Given: 0 포인트 사용
        const dto: PointUseDto = {
          userId: 1,
          amount: 0, // DTO 검증에서 차단
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.usePoints(dto))
          .rejects.toThrow();
      });

      it('잘못된 사용자 ID 시 에러를 발생시켜야 한다', async () => {
        // Given: 잘못된 사용자 ID
        const invalidDtos = [
          { userId: 0, amount: 100 },
          { userId: -1, amount: 100 },
          { userId: -100, amount: 100 },
        ];
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        for (const dto of invalidDtos) {
          await expect(service.usePoints(dto as PointUseDto))
            .rejects.toThrow();
        }
      });

      it('소수점 포인트 사용 시 에러를 발생시켜야 한다', async () => {
        // Given: 소수점 포인트 사용 (DTO 검증에서 차단됨)
        const dto: PointUseDto = {
          userId: 1,
          amount: 100.5, // DTO 검증에서 차단
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.usePoints(dto))
          .rejects.toThrow();
      });
    });

    describe('경계값 테스트', () => {
      it('최대 정수값 사용 시 에러를 발생시켜야 한다', async () => {
        // Given: 최대 정수값 사용 (DTO 검증에서 차단됨)
        const dto: PointUseDto = {
          userId: 1,
          amount: Number.MAX_SAFE_INTEGER, // DTO 검증에서 차단
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.usePoints(dto))
          .rejects.toThrow();
      });

      it('매우 큰 사용자 ID 시 에러를 발생시켜야 한다', async () => {
        // Given: 매우 큰 사용자 ID (DTO 검증에서 차단됨)
        const dto: PointUseDto = {
          userId: 999999999999, // DTO 검증에서 차단
          amount: 100,
        };
        
        // When & Then: DTO 검증에서 차단됨
        await expect(service.usePoints(dto))
          .rejects.toThrow();
      });
    });

    describe('데이터베이스 오류 케이스', () => {
      it('사용자 포인트 조회 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 데이터베이스 조회 실패
        const dto: PointUseDto = {
          userId: 1,
          amount: 100,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Database connection failed')
        );
        
        // When & Then: 데이터베이스 오류 시 예외 발생
        await expect(service.usePoints(dto))
          .rejects.toThrow('Database connection failed');
      });

      it('포인트 업데이트 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 포인트 업데이트 실패
        const dto: PointUseDto = {
          userId: 1,
          amount: 100,
        };
        
        mockPointRepository.getUserPoint.mockResolvedValue({
          id: dto.userId,
          point: 1000,
          updateMillis: Date.now(),
        });
        mockPointRepository.updatePointWithHistory.mockRejectedValue(
          new Error('Update failed')
        );
        
        // When & Then: 업데이트 실패 시 예외 발생
        await expect(service.usePoints(dto))
          .rejects.toThrow('Update failed');
      });
    });

    describe('네트워크 및 시스템 오류 케이스', () => {
      it('타임아웃 발생 시 에러를 발생시켜야 한다', async () => {
        // Given: 네트워크 타임아웃
        const dto: PointUseDto = {
          userId: 1,
          amount: 100,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Request timeout')
        );
        
        // When & Then: 타임아웃 시 예외 발생
        await expect(service.usePoints(dto))
          .rejects.toThrow('Request timeout');
      });

      it('메모리 부족 시 에러를 발생시켜야 한다', async () => {
        // Given: 메모리 부족 상황
        const dto: PointUseDto = {
          userId: 1,
          amount: 100,
        };
        
        mockPointRepository.getUserPoint.mockRejectedValue(
          new Error('Out of memory')
        );
        
        // When & Then: 메모리 부족 시 예외 발생
        await expect(service.usePoints(dto))
          .rejects.toThrow('Out of memory');
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

      it('내역이 없을 때는 빈 배열을 반환해야 한다', async () => {
        // Given: 내역이 없는 사용자
        const dto: PointUserDto = {
          userId: 999,
        };
        
        mockPointRepository.getHistories.mockResolvedValue([]);
        
        // When: 포인트 내역 조회
        const result = await service.getPointHistory(dto);
        
        // Then: 빈 배열 반환
        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
        expect(mockPointRepository.getHistories).toHaveBeenCalledWith(dto.userId);
      });

      it('여러 사용자의 내역을 독립적으로 조회해야 한다', async () => {
        // Given: 여러 사용자
        const dto1: PointUserDto = { userId: 1 };
        const dto2: PointUserDto = { userId: 2 };
        
        const mockHistories1 = [
          {
            id: 1,
            userId: dto1.userId,
            amount: 1000,
            type: TransactionType.CHARGE,
            timeMillis: Date.now(),
          },
        ];
        
        const mockHistories2 = [
          {
            id: 2,
            userId: dto2.userId,
            amount: 500,
            type: TransactionType.USE,
            timeMillis: Date.now(),
          },
        ];
        
        mockPointRepository.getHistories
          .mockResolvedValueOnce(mockHistories1)
          .mockResolvedValueOnce(mockHistories2);
        
        // When: 각각 내역 조회
        const result1 = await service.getPointHistory(dto1);
        const result2 = await service.getPointHistory(dto2);
        
        // Then: 각각 독립적인 결과
        expect(result1).toEqual(mockHistories1);
        expect(result2).toEqual(mockHistories2);
        expect(result1).toHaveLength(1);
        expect(result2).toHaveLength(1);
        expect(mockPointRepository.getHistories).toHaveBeenCalledTimes(2);
      });

      it('내역이 시간순으로 정렬되어야 한다', async () => {
        // Given: 시간순 정렬이 필요한 내역
        const dto: PointUserDto = {
          userId: 1,
        };
        const now = Date.now();
        const mockHistories = [
          {
            id: 1,
            userId: dto.userId,
            amount: 1000,
            type: TransactionType.CHARGE,
            timeMillis: now, // 이전 시간
          },
          {
            id: 2,
            userId: dto.userId,
            amount: 500,
            type: TransactionType.USE,
            timeMillis: now + 1000, // 나중 시간
          },
        ];
        
        mockPointRepository.getHistories.mockResolvedValue(mockHistories);
        
        // When: 포인트 내역 조회
        const result = await service.getPointHistory(dto);
        
        // Then: 시간순 정렬 확인 (DB에서 정렬되어 온다고 가정)
        expect(result).toHaveLength(2);
        expect(result[0].timeMillis).toBeLessThanOrEqual(result[1].timeMillis);
      });
    });

    describe('예외 케이스', () => {
      it('0이거나 음수인 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 잘못된 사용자 ID
        const invalidDtos = [
          { userId: 0 },
          { userId: -1 },
          { userId: -100 },
        ];
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        for (const dto of invalidDtos) {
          await expect(service.getPointHistory(dto as PointUserDto))
            .rejects.toThrow();
        }
      });
    });

    describe('경계값 테스트', () => {
      it('매우 큰 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 매우 큰 사용자 ID (성능 문제 가능성)
        const dto: PointUserDto = {
          userId: 999999999999, // DTO 검증에서 차단
        };
        
        // When & Then: 매우 큰 사용자 ID 시 에러 발생
        await expect(service.getPointHistory(dto))
          .rejects.toThrow();
      });

      it('최대 정수값 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 최대 정수값 사용자 ID
        const dto: PointUserDto = {
          userId: Number.MAX_SAFE_INTEGER, // DTO 검증에서 차단
        };
        
        // When & Then: 최대 정수값 시 에러 발생
        await expect(service.getPointHistory(dto))
          .rejects.toThrow();
      });
    });

    describe('데이터베이스 오류 케이스', () => {
      it('포인트 내역 조회 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 데이터베이스 조회 실패
        const dto: PointUserDto = {
          userId: 1,
        };
        
        mockPointRepository.getHistories.mockRejectedValue(
          new Error('Database connection failed')
        );
        
        // When & Then: 데이터베이스 오류 시 예외 발생
        await expect(service.getPointHistory(dto))
          .rejects.toThrow('Database connection failed');
      });

      it('네트워크 타임아웃 시 에러를 발생시켜야 한다', async () => {
        // Given: 네트워크 타임아웃
        const dto: PointUserDto = {
          userId: 1,
        };
        
        mockPointRepository.getHistories.mockRejectedValue(
          new Error('Request timeout')
        );
        
        // When & Then: 타임아웃 시 예외 발생
        await expect(service.getPointHistory(dto))
          .rejects.toThrow('Request timeout');
      });

      it('메모리 부족 시 에러를 발생시켜야 한다', async () => {
        // Given: 메모리 부족 상황
        const dto: PointUserDto = {
          userId: 1,
        };
        
        mockPointRepository.getHistories.mockRejectedValue(
          new Error('Out of memory')
        );
        
        // When & Then: 메모리 부족 시 예외 발생
        await expect(service.getPointHistory(dto))
          .rejects.toThrow('Out of memory');
      });
    });

    describe('대용량 데이터 케이스', () => {
      it('많은 내역이 있어도 정상적으로 조회해야 한다', async () => {
        // Given: 많은 내역
        const dto: PointUserDto = {
          userId: 1,
        };
        const mockHistories = Array.from({ length: 1000 }, (_, index) => ({
          id: index + 1,
          userId: dto.userId,
          amount: 100,
          type: index % 2 === 0 ? TransactionType.CHARGE : TransactionType.USE,
          timeMillis: Date.now() + index,
        }));
        
        mockPointRepository.getHistories.mockResolvedValue(mockHistories);
        
        // When: 포인트 내역 조회
        const result = await service.getPointHistory(dto);
        
        // Then: 모든 내역 반환
        expect(result).toEqual(mockHistories);
        expect(result).toHaveLength(1000);
        expect(mockPointRepository.getHistories).toHaveBeenCalledWith(dto.userId);
      });
    });
  });
}); 