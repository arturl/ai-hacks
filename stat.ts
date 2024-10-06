import { tTestTwoSample } from 'simple-statistics';
import { jStat } from 'jstat';

function mean(arr: number[]): number {
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function stdDev(arr: number[]): number {
    const avg = mean(arr);
    return Math.sqrt(arr.reduce((sum, val) => sum + (val - avg) ** 2, 0) / (arr.length - 1));
}

function calculateStatistics(set1: number[], set2: number[]) {
    const tStat = tTestTwoSample(set1, set2); // Get t-statistic
    const degreesOfFreedom = set1.length + set2.length - 2;

    if (tStat === null) {
        throw new Error("Failed to calculate t-statistic.");
    }

    // Calculate p-value based on the t-statistic and degrees of freedom
    const pValue = calculatePValue(tStat, degreesOfFreedom);

    return {
        tStat: Math.round(tStat * 100) / 100, // Round to 2 decimal places
        pValue: Math.round(pValue * 10000) / 10000 // Round to 4 decimal places
    };
}

// Calculate the two-tailed p-value using jStat
function calculatePValue(tStat: number, degreesOfFreedom: number): number {
    // Use the CDF of the t-distribution
    const cumulativeProbability = jStat.studentt.cdf(tStat, degreesOfFreedom);
    
    // For a two-tailed test, multiply by 2
    return (1 - cumulativeProbability) * 2; // Return p-value
}


const run1 : [number, number][] = [
    [845, 640],
    [737, 702],
    [813, 571],
    [727, 647],
    [837, 684],
    [724, 650],
    [693, 502],
    [646, 545],
    [763, 716],
    [621, 608],
    [583, 545],
    [615, 678],
    [621, 517],
    [699, 526],
    [647, 542],
    [665, 627],
    [669, 571],
    [720, 566],
    [637, 743],
    [594, 566],
];

doStatsOnPairs(run1);
/* Results:

Mean (Before): 692.8
Mean (After): 607.3
Difference in percentage: -12.341224018475751%
Standard Deviation (Before): 77.84302693308672
Standard Deviation (After): 72.13372085377634
T-Statistic: 3.6
P-Value: 0.0009
*/

function doStatsOnPairs(data: [number, number][]) {
    const beforeOptimization = data.map(pair => pair[0]);
    const afterOptimization = data.map(pair => pair[1]);
    doStats(beforeOptimization, afterOptimization);
}

function doStats(beforeOptimization: number[], afterOptimization: number[]) {
    const meanBefore = mean(beforeOptimization);
    const meanAfter = mean(afterOptimization);
    const { tStat, pValue } = calculateStatistics(beforeOptimization, afterOptimization);

    console.log(`Mean (Before): ${meanBefore}`);
    console.log(`Mean (After): ${meanAfter}`);
    console.log(`Difference in percentage: ${((meanAfter - meanBefore) / meanBefore) * 100}%`);
    console.log(`Standard Deviation (Before): ${stdDev(beforeOptimization)}`);
    console.log(`Standard Deviation (After): ${stdDev(afterOptimization)}`);
    console.log(`T-Statistic: ${tStat}`);
    console.log(`P-Value: ${pValue}`);
}

