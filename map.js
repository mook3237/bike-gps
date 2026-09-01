export default async function handler(req, res) {

    // ========================================
    // GET 요청만 허용
    // ========================================
    if (req.method !== 'GET') {

        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }


    try {

        const {
            start_x,
            start_y,
            end_x,
            end_y
        } = req.query;


        // ========================================
        // 좌표 확인
        // ========================================
        if (
            !start_x ||
            !start_y ||
            !end_x ||
            !end_y
        ) {

            return res.status(400).json({
                error: '출발지와 목적지 좌표가 필요합니다.'
            });
        }


        // ========================================
        // Vercel 환경변수에서
        // 카카오 REST API 키 가져오기
        // ========================================
        const restApiKey =
            process.env.KAKAO_REST_API_KEY;


        if (!restApiKey) {

            console.error(
                '❌ KAKAO_REST_API_KEY 없음'
            );

            return res.status(500).json({
                error:
                    'KAKAO_REST_API_KEY 환경변수가 없습니다.'
            });
        }


        // ========================================
        // 카카오 자전거 경로 API 주소 생성
        // ========================================
        const kakaoUrl =
            new URL(
                'https://dapi.kakao.com/v2/routing/bicycle'
            );


        kakaoUrl.searchParams.set(
            'start_x',
            start_x
        );


        kakaoUrl.searchParams.set(
            'start_y',
            start_y
        );


        kakaoUrl.searchParams.set(
            'end_x',
            end_x
        );


        kakaoUrl.searchParams.set(
            'end_y',
            end_y
        );


        // ========================================
        // 자전거도로 우선
        // ========================================
        kakaoUrl.searchParams.set(
            'route_mode',
            'BIKE_ONLY'
        );


        console.log(
            '🚴 카카오 자전거 경로 요청 시작',
            {
                start_x,
                start_y,
                end_x,
                end_y
            }
        );


        // ========================================
        // ⏱️ 카카오 API 최대 30초 대기
        // ========================================
        const controller =
            new AbortController();


        const timeoutId =
            setTimeout(
                () => {

                    console.error(
                        '⏱️ 카카오 API 요청 시간 초과'
                    );

                    controller.abort();

                },
                30000
            );


        let response;


        try {

            response =
                await fetch(
                    kakaoUrl.toString(),
                    {
                        method: 'GET',

                        headers: {
                            Authorization:
                                `KakaoAK ${restApiKey}`
                        },

                        signal:
                            controller.signal
                    }
                );

        } finally {

            clearTimeout(
                timeoutId
            );
        }


        // ========================================
        // 응답 상태 확인
        // ========================================
        console.log(
            '📡 카카오 API 응답 도착',
            response.status
        );


        let data;


        try {

            data =
                await response.json();

        } catch (jsonError) {

            console.error(
                '❌ 카카오 API JSON 변환 실패',
                jsonError
            );

            return res.status(500).json({
                error:
                    '카카오 API 응답을 읽을 수 없습니다.'
            });
        }


        // ========================================
        // 카카오 API 오류
        // ========================================
        if (!response.ok) {

            console.error(
                '❌ Kakao API 오류',
                {
                    status:
                        response.status,

                    data:
                        data
                }
            );


            return res.status(
                response.status
            ).json({

                error:
                    '카카오 자전거 경로 API 요청 실패',

                details:
                    data
            });
        }


        // ========================================
        // 성공
        // ========================================
        console.log(
            '✅ 카카오 자전거 경로 수신 완료'
        );


        return res.status(200).json(
            data
        );


    } catch (error) {

        // ========================================
        // 요청 시간 초과
        // ========================================
        if (
            error.name === 'AbortError'
        ) {

            console.error(
                '⏱️ 카카오 API 요청 시간 초과'
            );


            return res.status(504).json({

                error:
                    '카카오 자전거 경로 요청 시간이 초과되었습니다.'
            });
        }


        // ========================================
        // 기타 서버 오류
        // ========================================
        console.error(
            '❌ 서버 오류',
            error
        );


        return res.status(500).json({

            error:
                '자전거 경로를 가져오는 중 서버 오류가 발생했습니다.',

            message:
                error.message
        });
    }
}
