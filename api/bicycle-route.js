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

        // ========================================
        // 좌표 받기
        // ========================================
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
                error:
                    '출발지와 목적지 좌표가 필요합니다.'
            });
        }


        // ========================================
        // 카카오 REST API 키
        // ========================================
        const restApiKey =
            process.env.KAKAO_REST_API_KEY;


        if (!restApiKey) {

            return res.status(500).json({
                error:
                    'KAKAO_REST_API_KEY 환경변수가 없습니다.'
            });
        }


        // ========================================
        // 자전거 경로 요청 함수
        // ========================================
        async function getBicycleRoute(routeMode) {

            const kakaoUrl =
                new URL(
                    'https://dapi.kakao.com/v2/routing/bicycle'
                );


            // 출발지
            kakaoUrl.searchParams.set(
                'start_x',
                start_x
            );

            kakaoUrl.searchParams.set(
                'start_y',
                start_y
            );


            // 목적지
            kakaoUrl.searchParams.set(
                'end_x',
                end_x
            );

            kakaoUrl.searchParams.set(
                'end_y',
                end_y
            );


            // 경로 종류
            kakaoUrl.searchParams.set(
                'route_mode',
                routeMode
            );


            console.log(
                `🚴 경로 요청: ${routeMode}`
            );


            const response =
                await fetch(
                    kakaoUrl.toString(),
                    {
                        method: 'GET',

                        headers: {
                            Authorization:
                                `KakaoAK ${restApiKey}`
                        }
                    }
                );


            const data =
                await response.json();


            // API 오류
            if (!response.ok) {

                console.error(
                    `❌ ${routeMode} 경로 오류:`,
                    data
                );


                return {

                    success: false,

                    routeMode:
                        routeMode,

                    error:
                        data
                };
            }


            // 정상 응답이지만
            // 경로를 찾지 못한 경우
            if (
                !data ||
                data.status !== 'OK' ||
                !data.route
            ) {

                console.log(
                    `⚠️ ${routeMode} 경로 없음`
                );


                return {

                    success: false,

                    routeMode:
                        routeMode,

                    error:
                        data
                };
            }


            console.log(
                `✅ ${routeMode} 경로 수신`,
                {

                    distance:
                        data.route.properties
                            ?.totalDistance,

                    time:
                        data.route.properties
                            ?.totalTime
                }
            );


            return {

                success: true,

                routeMode:
                    routeMode,

                route:
                    data.route
            };
        }


        // ========================================
        // 3가지 경로 동시에 요청
        // ========================================

        const [

            shortestResult,

            bikeOnlyResult,

            accessibleResult

        ] =
            await Promise.all([

                // ⚡ 최단 경로
                getBicycleRoute(
                    'SHORTEST'
                ),

                // 🚴 자전거도로 우선
                getBicycleRoute(
                    'BIKE_ONLY'
                ),

                // 🙂 편안한 길
                getBicycleRoute(
                    'ACCESSIBLE'
                )
            ]);


        // ========================================
        // 성공한 경로만 저장
        // ========================================

        const routes = {


            shortest:

                shortestResult.success
                    ? shortestResult.route
                    : null,


            bikeOnly:

                bikeOnlyResult.success
                    ? bikeOnlyResult.route
                    : null,


            accessible:

                accessibleResult.success
                    ? accessibleResult.route
                    : null
        };


        // ========================================
        // 성공한 경로 개수
        // ========================================

        const successCount =

            Object.values(routes)

                .filter(
                    route => route !== null
                )

                .length;


        // ========================================
        // 전부 실패
        // ========================================

        if (successCount === 0) {

            return res.status(500).json({

                status:
                    'ERROR',

                error:
                    '자전거 경로를 찾지 못했습니다.'
            });
        }


        // ========================================
        // 성공
        // ========================================

        console.log(
            `🎉 자전거 경로 ${successCount}개 수신 완료`
        );


        return res.status(200).json({

            status:
                'OK',

            routes:
                routes
        });


    } catch (error) {

        console.error(
            '❌ 서버 오류:',
            error
        );


        return res.status(500).json({

            status:
                'ERROR',

            error:
                '자전거 경로를 가져오는 중 서버 오류가 발생했습니다.',

            message:
                error.message
        });
    }
}
