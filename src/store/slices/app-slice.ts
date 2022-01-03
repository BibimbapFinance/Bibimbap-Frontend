import { JsonRpcProvider } from '@ethersproject/providers';
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { BigNumber, ethers } from 'ethers';
import {
  BondingCalcContract,
  ClamCirculatingSupply,
  ClamTokenContract,
  ClamTokenMigrator,
  StakedClamContract,
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
  backingPerClam: number;
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

    const clamContract = new ethers.Contract(addresses.BBB_ADDRESS, ClamTokenContract, provider);
    const sCLAMContract = new ethers.Contract(addresses.sBBB_ADDRESS, StakedClamContract, provider);
    const bondCalculator = new ethers.Contract(addresses.CLAM_BONDING_CALC_ADDRESS, BondingCalcContract, provider);
    const clamCirculatingSupply = new ethers.Contract(
      addresses.CLAM_CIRCULATING_SUPPLY,
      ClamCirculatingSupply,
      provider,
    );
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

    const lp = contractForReserve('mai_clam', networkID, provider);
    const maiClamAmount = await lp.balanceOf(addresses.TREASURY_ADDRESS);
    const valuation = await bondCalculator.valuation(addressForReserve('mai_clam', networkID), maiClamAmount);
    const markdown = await bondCalculator.markdown(addressForReserve('mai_clam', networkID));

    const maiClamUSD = (valuation / 1e9) * (markdown / 1e18);
    const [rfvLPValue, pol] = await getDiscountedPairUSD(maiClamAmount, networkID, provider);

    const treasuryBalance = reserveAmount + maiClamUSD;
    const treasuryRiskFreeValue = reserveAmount + rfvLPValue;

    const stakingBalance = await stakingContract.contractBalance();
    const circSupply = (await clamCirculatingSupply.CLAMCirculatingSupply()) / 1e9;
    const totalSupply = (await clamContract.totalSupply()) / 1e9;
    const epoch = await stakingContract.epoch();
    const stakingReward = epoch.distribute / 1e9;
    const sClamCirc = (await sCLAMContract.circulatingSupply()) / 1e9;
    const stakingRebase = stakingReward / sClamCirc;
    const fiveDayRate = Math.pow(1 + stakingRebase, 5 * 3) - 1;
    const stakingAPY = Math.pow(1 + stakingRebase, 365 * 3) - 1;
    console.log('epoch : ');
    console.log(epoch);
    console.log('staking Reward : ' + stakingReward);
    console.log('sClamCirc : ' + sClamCirc);
    console.log('staking Rebase = stakingReward(' + stakingReward + ') / sClamCirc(' + sClamCirc + ').');
    console.log('staking Reward = epoch.distribute' + epoch.distribute / 1e9);
    console.log('staking APY : ' + stakingAPY);
    const stakingRatio = sClamCirc / circSupply;
    const backingPerClam = treasuryBalance / circSupply;
    const currentIndex = await stakingContract.index();
    const nextRebase = epoch.endTime.toNumber();

    const rawMarketPrice = await getMarketPrice(networkID, provider);
    const marketPrice = Number(((rawMarketPrice.toNumber() / 1e9) * maiPrice).toFixed(2));
    const stakingTVL = (stakingBalance * marketPrice) / 1e9;
    const marketCap = circSupply * marketPrice;

    const treasuryRunway = Math.log(treasuryRiskFreeValue / sClamCirc) / Math.log(1 + stakingRebase) / 3;

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
      marketPrice, // CLAM Price
      currentBlockTime,
      nextRebase,
      stakingRatio, // Staking Ratio
      backingPerClam, // Backing Per CLAM
      treasuryRunway, // Runway
      pol,
    };
  },
);

//(slp_treasury/slp_supply)*(2*sqrt(lp_dai * lp_clam))
async function getDiscountedPairUSD(
  lpAmount: BigNumber,
  networkID: number,
  provider: JsonRpcProvider,
): Promise<[number, number]> {
  const pair = contractForReserve('mai_clam', networkID, provider);
  const total_lp = await pair.totalSupply();
  const reserves = await pair.getReserves();
  const address = getAddresses(networkID);
  const [clam, mai] = BigNumber.from(address.MAI_ADDRESS).gt(address.BBB_ADDRESS)
    ? [reserves[0], reserves[1]]
    : [reserves[1], reserves[0]];
  const lp_token_1 = clam / 1e9;
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
