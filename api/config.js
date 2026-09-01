export default function handler(req, res) {

    const apiKey =
        process.env.KAKAO_MAP_API_KEY;

    if (!apiKey) {

        return res
            .status(500)
            .send(
                'console.error("KAKAO_MAP_API_KEY가 설정되지 않았습니다.");'
            );

    }

    res.setHeader(
        'Content-Type',
        'application/javascript; charset=utf-8'
    );

    return res.status(200).send(`
const CONFIG = {
    KAKAO_MAP_API_KEY: ${JSON.stringify(apiKey)},

    MAP: {
        centerLat: 37.5665,
        centerLng: 126.9780,
        initialZoom: 3
    },

    GPS: {
        highAccuracy: true,
        timeout: 5000,
        maximumAge: 2000
    }
};

const DEBUG = true;

function log(msg, data = '') {
    if (DEBUG) {
        console.log(
            '[' +
            new Date().toLocaleTimeString() +
            '] ' +
            msg,
            data
        );
    }
}

log('✅ Vercel CONFIG 로드 완료');
`);
}
