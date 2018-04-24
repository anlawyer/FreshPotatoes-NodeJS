const sqlite = require('sqlite');
const rp = require('request-promise');
const express = require('express');
const app = express();
const thirdPartyURL = 'http://credentials-api.generalassemb.ly/4576f55f-c427-4cfc-a11c-5bfe914ca6c1?films=';

const {PORT = 3000, NODE_ENV = 'development', DB_PATH = './db/database.db'} = process.env;

// ROUTE HANDLER
// get all films, just for fun
function getAllFilms (req, res, next) {
  try {
    const query = 'SELECT * FROM films';
    sqlite.all(query)
      .then(function (response) {
        res.status(200).send(response);
      });
  } catch (err) {
    next(err);
  }
}

function getFilmRecommendations (req, res, next) {
  // object to be returned upon function completion
  const filmRecommendationObj = {
    recommendations: [],
    meta: {
      limit: 10,
      offset: 0
    }
  };

  // setting variables from URL
  let filmID = req.params.id;
  let limitQuery = req.query.limit;
  let offsetQuery = req.query.offset;

  // data validation/error handling
  if (isNaN(parseInt(filmID)) || filmID === undefined) {
    res.status(422).send({message: 'Invalid film ID'}).end();
  }

  if (limitQuery !== undefined) {
    let limitNum = parseInt(limitQuery);
    if (isNaN(limitNum)) {
      res.status(422).send({message: 'Invalid limit query'}).end();
    } else {
      filmRecommendationObj.meta.limit = limitNum;
    }
  }

  if (offsetQuery !== undefined) {
    let offsetNum = parseInt(offsetQuery);
    if (isNaN(offsetNum)) {
      res.status(422).send({message: 'Invalid offset query'}).end();
    } else {
      filmRecommendationObj.meta.offset = offsetNum;
    }
  }

  // temporary array for holding review data
  const reviewArray = [];

  try {
    const query =
    `SELECT id
    ,genre_id AS genreID
    ,release_date AS releaseDate
    ,date(release_date, '+15 years') AS upperYear
    ,date(release_date, '-15 years') AS lowerYear
    FROM films
    WHERE id = ?`;
    // query for desired film data to recommend for
    sqlite.all(query, filmID)
      .then(function (response) {
        let filmObj = response[0];
        let genreID = filmObj.genreID;
        let upperYear = filmObj.upperYear;
        let lowerYear = filmObj.lowerYear;
        // query for all films that have same genre and were releaseed +/-15 yrs of queried film
        sqlite.all(`SELECT * FROM films WHERE genre_id = ? AND release_date BETWEEN ? AND ?`,
          [genreID, lowerYear, upperYear])
          .then(function (response) {
            return Promise.all(
              response.map(function (film) {
                let filmID = film.id;
                // call the API for each matched film to get review data
                return rp(thirdPartyURL + filmID)
                  .then(function (response) {
                    let matchedFilm = JSON.parse(response)[0];
                    let total = 0;
                    if (matchedFilm.reviews.length >= 5) {
                      matchedFilm.reviews.forEach(function (review) {
                        total += review.rating;
                      });
                      let averageRating = total / matchedFilm.reviews.length;
                      // if the average is greater than 4.0, push review object data into temp array
                      if (averageRating > 4.0) {
                        let averageRatingStr = averageRating.toFixed(1);
                        let partialObj = {};
                        partialObj['id'] = matchedFilm.film_id;
                        partialObj['averageRating'] = parseFloat(averageRatingStr);
                        partialObj['reviews'] = matchedFilm.reviews.length;
                        reviewArray.push(partialObj);
                      }
                    }
                    // return array of partial objects with review data
                    return reviewArray;
                  });
              }));
          })
          .then(function (response) {
            const query =
            `SELECT
            title
            ,genres.name AS genre
            ,release_date AS releaseDate
            FROM films
            JOIN genres ON films.genre_id = genres.id
            WHERE films.id = ?`;
            // query for the rest of the film data, for the each of the matched films
            return Promise.all(
              response[0].map(function (filmsToRecommend) {
                let filmID = filmsToRecommend.id;
                let partialFilmObj = filmsToRecommend;
                return sqlite.all(query, filmID)
                  .then(function (response) {
                    // combine film data with review data into one object
                    let finalFilmObj = Object.assign(partialFilmObj, response[0]);
                    filmRecommendationObj.recommendations.push(finalFilmObj);
                    return filmRecommendationObj;
                  });
              }));
          })
          // send complete response to client
          .then(function (response) {
            res.status(200).send(response[0]).end();
          })
          .catch(function (err) {
            console.log(err);
          });
      });
  } catch (err) {
    next(err);
  }
}

// ROUTES
app.get('/films', getAllFilms);
app.get('/films/:id/recommendations', getFilmRecommendations);
// route error handling
app.get('*', function (req, res) {
  res.status(404).send({message: 'invalid route'}).end();
});

// START SERVER
Promise.resolve()
  .then(() => sqlite.open(DB_PATH, { Promise }))
  .then(() => app.listen(PORT, () => console.log(`App listening on port ${PORT}`)))
  .catch((err) => { if (NODE_ENV === 'development') console.error(err.stack); });

module.exports = app;
