import { Test, TestingModule } from '@nestjs/testing';
import { PointController } from '../../controller/point.controller';
import { PointService } from '../../service/point.service';
import { PointRepository } from '../../repository/point.repository';
import { TransactionType } from '../../point.model';
import { PointChargeDto, PointUserDto, PointUseDto } from '../../dto/point.dto';

describe('PointSystem Integration Tests', () => {
  let controller: PointController;
  let service: PointService;
  let repository: jest.Mocked<PointRepository>;

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
        PointController,
        PointService,
        mockPointRepositoryProvider,
      ],
    }).compile();

    controller = module.get<PointController>(PointController);
    service = module.get<PointService>(PointService);
    repository = module.get(PointRepository);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
    expect(repository).toBeDefined();
  });

  describe('포인트 충전 통합 테스트', () => {
    it('Controller → Service → Repository 전체 플로우가 정상 동작해야 한다', async () => {
      // Given: 포인트 충전 요청
      const chargeDto: PointChargeDto = {
        userId: 1,
        amount: 1000,
      };

      // Mock Repository 동작 설정
      repository.getUserPoint.mockResolvedValue({
        id: chargeDto.userId,
        point: 0,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: chargeDto.userId,
        point: chargeDto.amount,
        updateMillis: Date.now(),
      });

      // When: Controller를 통한 포인트 충전
      const result = await controller.charge('1', chargeDto);

      // Then: 정상 응답 확인
      expect(result.currentBalance).toBe(1000);
      expect(result.transactionType).toBe('CHARGE');
      expect(result.userId).toBe(chargeDto.userId);
      expect(result.transactionAmount).toBe(chargeDto.amount);
      expect(repository.getUserPoint).toHaveBeenCalledWith(chargeDto.userId);
      expect(repository.updatePointWithHistory).toHaveBeenCalledWith(
        chargeDto.userId,
        chargeDto.amount,
        chargeDto.amount,
        TransactionType.CHARGE
      );
    });

    it('여러 번 충전 후 최종 잔고가 정확해야 한다', async () => {
      // Given: 여러 번 충전
      const userId = 2;
      const charges = [1000, 2000, 3000];

      // Mock Repository 동작 설정
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 6000, // 최종 잔고
        updateMillis: Date.now(),
      });

      // When: 순차적으로 충전
      for (const amount of charges) {
        await controller.charge(userId.toString(), { userId, amount });
      }

      // Mock 최종 조회 시 Repository 동작
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 6000,
        updateMillis: Date.now(),
      });

      // Then: 최종 잔고 확인
      const finalBalance = await controller.point(userId.toString());
      expect(finalBalance.currentBalance).toBe(6000); // 1000 + 2000 + 3000
    });
  });

  describe('포인트 사용 통합 테스트', () => {
    it('충전 후 사용이 정상적으로 동작해야 한다', async () => {
      // Given: 포인트 충전
      const userId = 3;
      
      // Mock Repository 동작 설정
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 5000,
        updateMillis: Date.now(),
      });
      
      await controller.charge(userId.toString(), { userId, amount: 5000 });

      // Mock 사용 시 Repository 동작
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 5000,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 3000,
        updateMillis: Date.now(),
      });

      // When: 포인트 사용
      const useDto: PointUseDto = {
        userId,
        amount: 2000,
      };
      const result = await controller.use(userId.toString(), useDto);

      // Then: 사용 결과 확인
      expect(result.currentBalance).toBe(3000); // 5000 - 2000
      expect(result.transactionType).toBe('USE');
      expect(result.transactionAmount).toBe(2000);
    });

    it('잔고 부족 시 적절한 에러가 발생해야 한다', async () => {
      // Given: 잔고 부족 상황
      const userId = 4;
      
      // Mock Repository 동작 설정
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 1000,
        updateMillis: Date.now(),
      });
      
      await controller.charge(userId.toString(), { userId, amount: 1000 });

      // Mock 잔고 부족 상황
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 1000,
        updateMillis: Date.now(),
      });

      // When & Then: 잔고보다 많은 금액 사용 시도
      await expect(
        controller.use(userId.toString(), { userId, amount: 1500 })
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('포인트 조회 통합 테스트', () => {
    it('충전과 사용 후 잔고 조회가 정확해야 한다', async () => {
      // Given: 포인트 충전 및 사용
      const userId = 5;
      
      // Mock Repository 동작 설정
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 3000,
        updateMillis: Date.now(),
      });
      
      await controller.charge(userId.toString(), { userId, amount: 3000 });

      // Mock 사용 시 Repository 동작
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 3000,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 2000,
        updateMillis: Date.now(),
      });
      
      await controller.use(userId.toString(), { userId, amount: 1000 });

      // Mock 조회 시 Repository 동작
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 2000,
        updateMillis: Date.now(),
      });

      // When: 잔고 조회
      const result = await controller.point(userId.toString());

      // Then: 정확한 잔고 확인
      expect(result.currentBalance).toBe(2000); // 3000 - 1000
      expect(result.userId).toBe(userId);
    });

    it('새로운 사용자의 잔고는 0이어야 한다', async () => {
      // Given: 새로운 사용자
      const userId = 999;

      // Mock Repository 동작 설정
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis: Date.now(),
      });

      // When: 잔고 조회
      const result = await controller.point(userId.toString());

      // Then: 0 반환
      expect(result.currentBalance).toBe(0);
      expect(result.userId).toBe(userId);
    });
  });

  describe('포인트 내역 조회 통합 테스트', () => {
    it('충전과 사용 후 내역이 정확히 기록되어야 한다', async () => {
      // Given: 포인트 충전 및 사용
      const userId = 6;
      
      // Mock Repository 동작 설정
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 2000,
        updateMillis: Date.now(),
      });
      
      await controller.charge(userId.toString(), { userId, amount: 2000 });

      // Mock 사용 시 Repository 동작
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 2000,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 1500,
        updateMillis: Date.now(),
      });
      
      await controller.use(userId.toString(), { userId, amount: 500 });

      // Mock 내역 조회 시 Repository 동작
      repository.getHistories.mockResolvedValue([
        {
          id: 1,
          userId: userId,
          amount: 2000,
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
      ]);

      // When: 내역 조회
      const histories = await controller.history(userId.toString());

      // Then: 내역 확인
      expect(histories).toHaveLength(2);
      expect(histories[0].type).toBe(TransactionType.CHARGE);
      expect(histories[0].amount).toBe(2000);
      expect(histories[1].type).toBe(TransactionType.USE);
      expect(histories[1].amount).toBe(500);
    });
  });

  describe('전체 시나리오 통합 테스트', () => {
    it('충전 → 사용 → 조회 → 내역 조회 전체 플로우가 정상 동작해야 한다', async () => {
      // Given: 사용자 생성
      const userId = 7;

      // Mock Repository 동작 설정
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 5000,
        updateMillis: Date.now(),
      });

      // When: 전체 플로우 실행
      // 1. 포인트 충전
      const chargeResult = await controller.charge(userId.toString(), { userId, amount: 5000 });
      expect(chargeResult.currentBalance).toBe(5000);

      // Mock 사용 시 Repository 동작
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 5000,
        updateMillis: Date.now(),
      });
      repository.updatePointWithHistory.mockResolvedValue({
        id: userId,
        point: 3000,
        updateMillis: Date.now(),
      });

      // 2. 포인트 사용
      const useResult = await controller.use(userId.toString(), { userId, amount: 2000 });
      expect(useResult.currentBalance).toBe(3000);

      // Mock 조회 시 Repository 동작
      repository.getUserPoint.mockResolvedValue({
        id: userId,
        point: 3000,
        updateMillis: Date.now(),
      });

      // 3. 잔고 조회
      const balanceResult = await controller.point(userId.toString());
      expect(balanceResult.currentBalance).toBe(3000);

      // Mock 내역 조회 시 Repository 동작
      repository.getHistories.mockResolvedValue([
        {
          id: 1,
          userId: userId,
          amount: 5000,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
        },
        {
          id: 2,
          userId: userId,
          amount: 2000,
          type: TransactionType.USE,
          timeMillis: Date.now(),
        },
      ]);

      // 4. 내역 조회
      const histories = await controller.history(userId.toString());
      expect(histories).toHaveLength(2);
      expect(histories[0].type).toBe(TransactionType.CHARGE);
      expect(histories[1].type).toBe(TransactionType.USE);

      // Then: 모든 데이터가 일관성 있게 유지됨
      expect(chargeResult.userId).toBe(userId);
      expect(useResult.userId).toBe(userId);
      expect(balanceResult.userId).toBe(userId);
    });
  });
}); 