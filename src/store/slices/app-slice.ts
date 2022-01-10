import { JsonRpcProvider } from '@ethersproject/providers';
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { BigNumber, ethers } from 'ethers';
import {
  BondingCalcContract,
  BBBCirculatingSupply,
  BBBTokenContract,
  BBBTokenMigrator,
  StakedBBBContract,
  StakingContract,
} from '../../abi';
import { getAddresses, ReserveKeys } from '../../constants';
import { addressForReserve, contractForReserve, getMarketPrice, getTokenPrice, setAll } from '../../helpers';

const initialState = {
  loading: true,
};

export interface IApp {
  loading: boolean;
  stakingTVL: number;
  marketPrice: number;
  marketCap: number;
  totalSupply: number;
  circSupply: number;
  currentIndex: string;
  currentBlock: number;
  currentBlockTime: number;
  fiveDayRate: number;
  treasuryBalance: number;
  stakingAPY: number;
  stakingRebase: number;
  networkID: number;
  nextRebase: number;
  stakingRatio: number;
  backingPerBBB: number;
  treasuryRunway: number;
  pol: number;
}

interface ILoadAppDetails {
  networkID: number;
  provider: JsonRpcProvider;
}

export const loadAppDetails = createAsyncThunk(
  'app/loadAppDetails',
  //@ts-ignore
  async ({ networkID, provider }: ILoadAppDetails) => {
    const maiPrice = await getTokenPrice('MAI');

    const addresses = getAddresses(networkID);
    const currentBlock = await provider.getBlockNumber();
    const currentBlockTime = (await provider.getBlock(currentBlock)).timestamp;

    const BBBContract = new ethers.Contract(addresses.BBB_ADDRESS, BBBTokenContract, provider);
    const sBBBContract = new ethers.Contract(addresses.sBBB_ADDRESS, StakedBBBContract, provider);
    const bondCalculator = new ethers.Contract(addresses.BBB_BONDING_CALC_ADDRESS, BondingCalcContract, provider);
    const bbbCirculatingSupply = new ethers.Contract(addresses.BBB_CIRCULATING_SUPPLY, BBBCirculatingSupply, provider);
    const stakingContract = new ethers.Contract(addresses.STAKING_ADDRESS, StakingContract, provider);

    let reserveAmount = (
      await Promise.all(
        ReserveKeys.map(async key => {
          const token = contractForReserve(key, networkID, provider);
          const balance = await token.balanceOf(addresses.TREASURY_ADDRESS);
          return balance / 1e18;
        }),
      )
    ).reduce((prev, value) => prev + value);

    const lp = contractForReserve('mai_bbb', networkID, provider);
    const maiBBBAmount = await lp.balanceOf(addresses.TREASURY_ADDRESS);
    const valuation = await bondCalculator.valuation(addressForReserve('mai_bbb', networkID), maiBBBAmount);
    const markdown = await bondCalculator.markdown(addressForReserve('mai_bbb', networkID));

    const maiBBBUSD = (valuation / 1e9) * (markdown / 1e18);
    const [rfvLPValue, pol] = await getDiscountedPairUSD(maiBBBAmount, networkID, provider);

    const treasuryBalance = reserveAmount + maiBBBUSD;
    const treasuryRiskFreeValue = reserveAmount + rfvLPValue;

    const stakingBalance = await stakingContract.contractBalance();
    const circSupply = (await bbbCirculatingSupply.CLAMCirculatingSupply()) / 1e9;
    const totalSupply = (await BBBContract.totalSupply()) / 1e9;
    const epoch = await stakingContract.epoch();
    const stakingReward = epoch.distribute / 1e9;
    const sBBBCirc = (await sBBBContract.circulatingSupply()) / 1e9;
    const stakingRebase = stakingReward / sBBBCirc;
    const fiveDayRate = Math.pow(1 + stakingRebase, 5 * 3) - 1;
    const stakingAPY = Math.pow(1 + stakingRebase, 365 * 3) - 1;

    const stakingRatio = sBBBCirc / circSupply;
    const backingPerBBB = treasuryBalance / circSupply;
    const currentIndex = await stakingContract.index();
    const nextRebase = epoch.endTime.toNumber();

    const rawMarketPrice = await getMarketPrice(networkID, provider);
    const marketPrice = Number(((rawMarketPrice.toNumber() / 1e9) * maiPrice).toFixed(2));
    const stakingTVL = (stakingBalance * marketPrice) / 1e9;
    const marketCap = circSupply * marketPrice;

    const treasuryRunway = Math.log(treasuryRiskFreeValue / sBBBCirc) / Math.log(1 + stakingRebase) / 3;

    return {
      currentIndex: ethers.utils.formatUnits(currentIndex, 'gwei'), // Current Index
      totalSupply,
      circSupply,
      marketCap, // Market Cap
      currentBlock,
      fiveDayRate,
      treasuryBalance, // Treasury Balance
      stakingAPY, // Staking APY
      stakingTVL, // Staking TVL
      stakingRebase,
      marketPrice, // BBB Price
      currentBlockTime,
      nextRebase,
      stakingRatio, // Staking Ratio
      backingPerBBB, // Backing Per BBB
      treasuryRunway, // Runway
      pol,
    };
  },
);

//(slp_treasury/slp_supply)*(2*sqrt(lp_dai * lp_bbb))
async function getDiscountedPairUSD(
  lpAmount: BigNumber,
  networkID: number,
  provider: JsonRpcProvider,
): Promise<[number, number]> {
  const pair = contractForReserve('mai_bbb', networkID, provider);
  const total_lp = await pair.totalSupply();
  const reserves = await pair.getReserves();
  const address = getAddresses(networkID);
  const [bbb, mai] = BigNumber.from(address.MAI_ADDRESS).gt(address.BBB_ADDRESS)
    ? [reserves[0], reserves[1]]
    : [reserves[1], reserves[0]];
  const lp_token_1 = bbb / 1e9;
  const lp_token_2 = mai / 1e18;
  const kLast = lp_token_1 * lp_token_2;

  const pol = lpAmount.mul(100).div(total_lp).toNumber() / 100;
  const part2 = Math.sqrt(kLast) * 2;
  return [pol * part2, pol];
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    fetchAppSuccess(state, action) {
      setAll(state, action.payload);
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadAppDetails.pending, (state, action) => {
        state.loading = true;
      })
      .addCase(loadAppDetails.fulfilled, (state, action) => {
        setAll(state, action.payload);
        state.loading = false;
      })
      .addCase(loadAppDetails.rejected, (state, { error }) => {
        state.loading = false;
        console.log(error);
      });
  },
});

const baseInfo = (state: { app: IApp }) => state.app;

export default appSlice.reducer;

export const { fetchAppSuccess } = appSlice.actions;

export const getAppState = createSelector(baseInfo, app => app);
