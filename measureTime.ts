export async function measureExecutionTime<T>(
    fn: (...args: any[]) => Promise<T> | T, 
    ...args: any[]
): Promise<{result:T, executionTime:number}> {
    const startTime = performance.now();  // Start timing
    const result = await fn(...args);     // Execute and await the function if async
    const endTime = performance.now();    // End timing
    const executionTime = Math.ceil(endTime - startTime);
    return {result, executionTime};                        // Return the result of the function
}
