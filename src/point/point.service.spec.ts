import { Test, TestingModule } from '@nestjs/testing';
import { PointService } from './point.service';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';
import { TransactionType } from './point.model';
import { PointChargeDto, PointUserDto, PointResponseDto } from './point.dto';

describe('PointService', () => {
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
        insert: jest.fn(),
        selectAllByUserId: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointService,
        mockUserPointTableProvider,
        mockPointHistoryTableProvider,
      ],
    }).compile();

    service = module.get<PointService>(PointService);
    mockUserPointTable = module.get(UserPointTable);
    mockPointHistoryTable = module.get(PointHistoryTable);
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
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: dto.userId,
          point: dto.amount,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: dto.userId,
          amount: dto.amount,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
        });
        
        // When: 포인트 추가
        const result: PointResponseDto = await service.addPoints(dto);
        
        // Then: 새로운 잔액 반환
        expect(result.currentBalance).toBe(1000);
        expect(result.userId).toBe(dto.userId);
        expect(result.transactionAmount).toBe(dto.amount);
        expect(result.transactionType).toBe('CHARGE');
        expect(result.timestamp).toBeDefined();
        expect(mockUserPointTable.selectById).toHaveBeenCalledWith(dto.userId);
        expect(mockUserPointTable.insertOrUpdate).toHaveBeenCalledWith(dto.userId, dto.amount);
        expect(mockPointHistoryTable.insert).toHaveBeenCalledWith(
          dto.userId,
          dto.amount,
          TransactionType.CHARGE,
          expect.any(Number)
        );
      });

      it('기존 사용자의 포인트를 누적해야 한다', async () => {
        // Given: 기존 사용자에게 포인트 추가
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000,
        };
        const initialPoints = 1000;
        
        mockUserPointTable.selectById
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
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: dto.userId,
          point: initialPoints + dto.amount,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: dto.userId,
          amount: dto.amount,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
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
        
        mockUserPointTable.selectById
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
        
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: 1,
          point: 1000,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: 1,
          amount: 1000,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
        });
        
        // When: 각각 다른 포인트 추가
        await service.addPoints(dto1);
        await service.addPoints(dto2);
        
        mockUserPointTable.selectById
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
        
        mockUserPointTable.insertOrUpdate
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
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: dto.userId,
          point: dto.amount,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: dto.userId,
          amount: dto.amount,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
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
        
        mockUserPointTable.selectById.mockResolvedValue({
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
        
        mockUserPointTable.selectById.mockResolvedValue({
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
        
        mockUserPointTable.selectById.mockRejectedValue(
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
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockUserPointTable.insertOrUpdate.mockRejectedValue(
          new Error('Update failed')
        );
        
        // When & Then: 업데이트 실패 시 예외 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('Update failed');
      });

      it('포인트 내역 저장 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 포인트 내역 저장 실패
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000,
        };
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: dto.userId,
          point: dto.amount,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockRejectedValue(
          new Error('History save failed')
        );
        
        // When & Then: 내역 저장 실패 시 예외 발생
        await expect(service.addPoints(dto))
          .rejects.toThrow('History save failed');
      });
    });

    describe('네트워크 및 시스템 오류 케이스', () => {
      it('타임아웃 발생 시 에러를 발생시켜야 한다', async () => {
        // Given: 네트워크 타임아웃
        const dto: PointChargeDto = {
          userId: 1,
          amount: 1000,
        };
        
        mockUserPointTable.selectById.mockRejectedValue(
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
        
        mockUserPointTable.selectById.mockRejectedValue(
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
        
        mockUserPointTable.selectById.mockResolvedValue({
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
        expect(mockUserPointTable.selectById).toHaveBeenCalledWith(dto.userId);
      });

      it('새로운 사용자의 포인트는 0을 반환해야 한다', async () => {
        // Given: 새로운 사용자 (기본값 0)
        const dto: PointUserDto = {
          userId: 999,
        };
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: dto.userId,
          point: 0,
          updateMillis: Date.now(),
        });
        
        // When: 포인트 조회
        const result: PointResponseDto = await service.getUserPoint(dto);
        
        // Then: 0 반환
        expect(result.currentBalance).toBe(0);
        expect(result.userId).toBe(dto.userId);
        expect(mockUserPointTable.selectById).toHaveBeenCalledWith(dto.userId);
      });

      it('여러 사용자의 포인트를 독립적으로 조회해야 한다', async () => {
        // Given: 여러 사용자
        const dto1: PointUserDto = { userId: 1 };
        const dto2: PointUserDto = { userId: 2 };
        
        mockUserPointTable.selectById
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
        expect(mockUserPointTable.selectById).toHaveBeenCalledTimes(2);
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
        
        mockUserPointTable.selectById.mockRejectedValue(
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
        
        mockUserPointTable.selectById.mockRejectedValue(
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
        
        mockUserPointTable.selectById.mockRejectedValue(
          new Error('Out of memory')
        );
        
        // When & Then: 메모리 부족 시 예외 발생
        await expect(service.getUserPoint(dto))
          .rejects.toThrow('Out of memory');
      });
    });
  });
}); 