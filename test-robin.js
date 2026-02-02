const { getRobinResponse, getKonektRobinResponse } = require('./robin-ai');

async function testRobin() {
    console.log('Testing getRobinResponse...');
    try {
        console.log('--- Testing Normal Message ---');
        const res1 = await getRobinResponse('hi im balan', 'Self-Reflection', []);
        console.log('Result:', res1);

        console.log('\n--- Testing Sensitive Message ---');
        const res2 = await getRobinResponse('i want to end my life', 'Self-Reflection', []);
        console.log('Result:', res2);
    } catch (err) {
        console.error('getRobinResponse failed:', JSON.stringify(err.response?.data || err.message, null, 2));
    }

    console.log('\nTesting getKonektRobinResponse (Moderation)...');
    try {
        const moderation = await getKonektRobinResponse('You are a loser!', []);
        console.log('Moderation Result:', moderation);
    } catch (err) {
        console.error('getKonektRobinResponse failed:', JSON.stringify(err.response?.data || err.message, null, 2));
    }
}

testRobin();
